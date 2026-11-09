/**
 * 通用 SQL 构造辅助。
 *
 * 为什么手写而不是上 ORM：只有几张表、列名是 camelCase 且必须原样返回，
 * 用白名单拼 SQL 反而比任何 ORM 都短、都清楚、都容易 review。
 *
 * 安全前提：列名永远来自白名单（代码里的常量数组），绝不来自请求体。
 * 值永远走 $N 参数化。
 */

/** 双引号包裹标识符，保留 camelCase。 */
export function id(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * pg 对 jsonb 参数需要显式序列化；普通标量原样传。
 * @param {unknown} v
 */
export function toDbValue(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === "object" && !(v instanceof Date)) {
    return JSON.stringify(v);
  }
  return v;
}

/**
 * 从请求体里按白名单取列，丢弃未知键（原版 supabase 会因未知列报错，
 * 这里选择忽略 —— 对合法请求行为完全一致，对未知键更宽容）。
 *
 * @param {Record<string, unknown>} body
 * @param {readonly string[]} columns
 * @returns {{ cols: string[], values: unknown[], placeholders: string[] }}
 */
export function pickColumns(body, columns) {
  const cols = [];
  const values = [];
  const placeholders = [];

  for (const col of columns) {
    if (!Object.hasOwn(body ?? {}, col)) continue;
    cols.push(col);
    values.push(toDbValue(body[col]));
    placeholders.push(`$${values.length}`);
  }

  return { cols, values, placeholders };
}

/**
 * 生成 INSERT ... RETURNING *。
 * @param {string} table
 * @param {Record<string, unknown>} body
 * @param {readonly string[]} columns
 */
export function buildInsert(table, body, columns) {
  const { cols, values, placeholders } = pickColumns(body, columns);
  if (cols.length === 0) {
    return { sql: `INSERT INTO ${id(table)} DEFAULT VALUES RETURNING *`, values: [] };
  }
  const sql = `INSERT INTO ${id(table)} (${cols.map(id).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
  return { sql, values };
}

/**
 * 生成 UPDATE ... WHERE id = $n RETURNING *。
 * @param {string} table
 * @param {Record<string, unknown>} body
 * @param {readonly string[]} columns
 * @param {string} rowId
 */
export function buildUpdate(table, body, columns, rowId) {
  const { cols, values } = pickColumns(body, columns);
  if (cols.length === 0) {
    return { sql: `SELECT * FROM ${id(table)} WHERE id = $1`, values: [rowId] };
  }
  const sets = cols.map((c, i) => `${id(c)} = $${i + 1}`);
  const sql = `UPDATE ${id(table)} SET ${sets.join(", ")} WHERE id = $${cols.length + 1} RETURNING *`;
  return { sql, values: [...values, rowId] };
}
