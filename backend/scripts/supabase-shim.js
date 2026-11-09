/**
 * supabase-shim —— 把 @supabase/supabase-js 的最小 PostgreSQL 子集实现到本地 pg。
 *
 * 存在的唯一目的：`render-backend/server.js` 依赖 Supabase 的 PostgREST（HTTP），
 * 没有真实 Supabase 项目就无法启动，也就拿不到「原版功能」的参照快照。
 * 有了本 shim，原版 Express 可以跑在本地 Postgres 上，从而可以：
 *
 *   原版(Express + shim) ─┐
 *                        ├─ 同一套 curl 断言 → 逐字节比对 → 证明功能一致
 *   新版(Fastify + pg)  ─┘
 *
 * 只实现 server.js 实际用到的调用形状（见下），不追求完整兼容：
 *   .from(t).select(cols).eq/.lt/.order/.limit/.single()
 *   .from(t).insert(row|rows).select()
 *   .from(t).update(patch).eq().select()
 *   .from(t).delete().eq()/.lt()
 *
 * 所有 builder 都是 thenable，`await` 时才执行，与 supabase-js 语义一致。
 * 返回值统一为 `{ data, error }`，error 是 `{ message }` 形状，与原版错误处理路径对齐。
 */

import pg from "pg";

const { Pool, types } = pg;

// ---------------------------------------------------------------------------
// 类型解析对齐 PostgREST（supabase-js 走的是 HTTP + JSON，数字就是 JSON number）。
// node-postgres 默认把 int8/numeric 返回成字符串（防止超过 2^53 丢精度），
// 这会让 task_logs.id 变成 "1" 而 supabase-js 给的是 1 —— 是真实差异，必须抹平，
// 否则对拍测试会报假阳性，掩盖真正的问题。
// ---------------------------------------------------------------------------
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

/** 列名/表名转 SQL 标识符。必须引号包裹，否则 camelCase 列（roleId/isRestore）会被折叠成小写。 */
function id(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** 把 JS 值转成 pg 期望的形状：对象/数组 -> JSON 文本（对应 jsonb 列）。 */
function toDbValue(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === "object" && !(v instanceof Date)) {
    return JSON.stringify(v);
  }
  return v;
}

const OPS = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
  ilike: "ILIKE",
};

class QueryBuilder {
  constructor(pool, table) {
    this.pool = pool;
    this.table = table;
    this.op = null;
    this.payload = null;
    this.columns = null;
    this.filters = [];
    this.orderBy = null;
    this.limitN = null;
    this.isSingle = false;
    this.wantReturning = false;
  }

  // ---------- 操作类型 ----------
  select(columns = "*") {
    this.columns = columns;
    if (this.op === null || this.op === "insert" || this.op === "update") {
      // insert/update 之后调 .select() 表示要 RETURNING
      if (this.op === null) this.op = "select";
      else this.wantReturning = true;
    }
    return this;
  }

  insert(rows) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }

  update(patch) {
    this.op = "update";
    this.payload = patch;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  // ---------- 过滤 ----------
  eq(col, val) {
    this.filters.push({ sql: `${id(col)} = $`, val });
    return this;
  }

  neq(col, val) {
    this.filters.push({ sql: `${id(col)} <> $`, val });
    return this;
  }

  lt(col, val) {
    this.filters.push({ sql: `${id(col)} < $`, val });
    return this;
  }

  lte(col, val) {
    this.filters.push({ sql: `${id(col)} <= $`, val });
    return this;
  }

  gt(col, val) {
    this.filters.push({ sql: `${id(col)} > $`, val });
    return this;
  }

  gte(col, val) {
    this.filters.push({ sql: `${id(col)} >= $`, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ sql: `${id(col)} = ANY($)`, val: vals });
    return this;
  }

  is(col, val) {
    this.filters.push({ sql: `${id(col)} IS ${val === null ? "NULL" : "NOT NULL"}`, val: undefined, raw: true });
    return this;
  }

  // ---------- 排序 / 分页 / 单行 ----------
  order(col, { ascending = true } = {}) {
    this.orderBy = { col, dir: ascending ? "ASC" : "DESC" };
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  // ---------- 执行 ----------
  buildWhere(params) {
    if (this.filters.length === 0) return "";
    const parts = this.filters.map((f) => {
      if (f.raw) return f.sql;
      params.push(toDbValue(f.val));
      return f.sql.replace("$", `$${params.length}`);
    });
    return ` WHERE ${parts.join(" AND ")}`;
  }

  async execute() {
    const params = [];
    const client = await this.pool.connect();
    try {
      if (this.op === "select") {
        let sql = `SELECT ${this.columns === "*" ? "*" : this.columns} FROM ${id(this.table)}`;
        sql += this.buildWhere(params);
        if (this.orderBy) sql += ` ORDER BY ${id(this.orderBy.col)} ${this.orderBy.dir}`;
        if (this.limitN != null) sql += ` LIMIT ${Number.parseInt(this.limitN, 10)}`;
        const res = await client.query(sql, params);
        return this.shapeSelect(res.rows);
      }

      if (this.op === "insert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (rows.length === 0) return { data: this.shapeInsert([]), error: null };
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const tuples = rows.map((r) => cols.map((c) => toDbValue(r[c])));
        const placeholders = tuples
          .map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(", ")})`)
          .join(", ");
        const flat = tuples.flat();
        const sql = `INSERT INTO ${id(this.table)} (${cols.map(id).join(", ")}) VALUES ${placeholders} RETURNING *`;
        const res = await client.query(sql, flat);
        return { data: this.shapeInsert(res.rows), error: null };
      }

      if (this.op === "update") {
        const patch = this.payload || {};
        const cols = Object.keys(patch);
        if (cols.length === 0) return { data: [], error: null };
        const sets = cols.map((c) => {
          params.push(toDbValue(patch[c]));
          return `${id(c)} = $${params.length}`;
        });
        let sql = `UPDATE ${id(this.table)} SET ${sets.join(", ")}`;
        sql += this.buildWhere(params);
        if (this.wantReturning) sql += " RETURNING *";
        const res = await client.query(sql, params);
        if (this.wantReturning) {
          const data = this.isSingle ? res.rows[0] ?? null : res.rows;
          return { data, error: null };
        }
        return { data: null, error: null };
      }

      if (this.op === "delete") {
        let sql = `DELETE FROM ${id(this.table)}`;
        sql += this.buildWhere(params);
        const res = await client.query(sql, params);
        return { data: null, error: null, count: res.rowCount };
      }

      return { data: null, error: { message: `shim: unsupported op "${this.op}"` } };
    } catch (err) {
      return { data: null, error: { message: err.message, code: err.code } };
    } finally {
      client.release();
    }
  }

  shapeSelect(rows) {
    if (this.isSingle) {
      if (rows.length === 0) {
        return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      }
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  shapeInsert(rows) {
    // supabase-js 的 insert 未接 .select() 时 data 为 null
    if (!this.wantReturning) return null;
    return rows;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

/**
 * 创建与原版调用形状一致的客户端。
 *
 * 原版调用是 `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)`，
 * 那两个值是 https:// 开头的 PostgREST 地址。这里只在第一个参数确实是 postgres
 * 连接串时才采用它，否则一律回落到 DATABASE_URL —— 这样原版 server.js 一个字都不用改。
 *
 * @param {string} [maybeConnString] 可能是 Postgres 连接串；否则忽略
 * @returns {{ from: (table: string) => QueryBuilder, __end: () => Promise<void> }}
 */
export function createClient(maybeConnString) {
  const connectionString =
    typeof maybeConnString === "string" && maybeConnString.startsWith("postgres")
      ? maybeConnString
      : process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("supabase-shim: 需要 DATABASE_URL（本地 Postgres 连接串）");
  }
  const pool = new Pool({ connectionString, max: 5 });
  return {
    from(table) {
      return new QueryBuilder(pool, table);
    },
    __end: () => pool.end(),
  };
}

export default { createClient };
