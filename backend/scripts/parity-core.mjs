/**
 * 功能对拍核心（parity core）。
 *
 * 「抓基准」和「跑对拍」必须共用同一份用例与归一化逻辑，否则两边漂移会让对比失去意义。
 *
 * 用法：
 *   runAll({ base, apiKey })  → { caseCount, results }
 *   diffResults(expected, actual) → 差异列表（空数组表示完全一致）
 */

import pg from "pg";

export const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://xyzw:xyzw_dev_pw@127.0.0.1:55432/xyzw";

export const API_KEY = process.env.API_KEY || "dev-api-key";

// ---------------------------------------------------------------- 归一化

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/**
 * 递归归一化：uuid → <UUID>，ISO 时间 → <ISO>。
 * 保留字段名、类型、数组长度和顺序 —— 这些才是接口契约。
 */
export function normalize(value) {
  if (typeof value === "string") {
    return value.replace(UUID_RE, "<UUID>").replace(ISO_RE, "<ISO>");
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = normalize(value[k]);
    return out;
  }
  return value;
}

/**
 * 结构指纹：只保留「类型骨架」，丢弃所有具体值。
 * 用于值天然不可复现的接口（内存日志条数、启动时间、cron 注册次数）。
 */
export function shapeOf(value) {
  if (Array.isArray(value)) {
    return { type: "array", of: value.length > 0 ? shapeOf(value[0]) : null };
  }
  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = shapeOf(value[k]);
    return out;
  }
  return typeof value;
}

// ---------------------------------------------------------------- fixture

/**
 * 固定种子数据。每次跑对拍前重建，保证基准与实测面对同一份输入。
 * 里面的 ws_url 指向 127.0.0.1:1，让任何真实的连接尝试立刻 ECONNREFUSED 而不是等 15s 超时。
 */
export async function resetFixture(pool) {
  await pool.query("TRUNCATE tokens, cron_tasks, task_logs RESTART IDENTITY CASCADE");
  await pool.query(
    `INSERT INTO tokens (id, name, token, "roleId", "sessId", "connId", "isRestore", ws_url, enabled)
     VALUES
       ('11111111-1111-1111-1111-111111111111', 'alpha', 'tok-alpha', 'R1', 'S1', 'C1', true,  'ws://127.0.0.1:1', true),
       ('22222222-2222-2222-2222-222222222222', 'beta',  'tok-beta',  'R2', 'S2', 'C2', false, 'ws://127.0.0.1:1', false)`,
  );
  await pool.query(
    `INSERT INTO cron_tasks (id, name, cron_expr, selected_tokens, selected_tasks, enabled)
     VALUES ('33333333-3333-3333-3333-333333333333', 'nightly', '0 3 * * *',
             '["11111111-1111-1111-1111-111111111111"]'::jsonb, '["signIn"]'::jsonb, true)`,
  );
  await pool.query(
    `INSERT INTO task_logs (task_id, token_name, task_type, status, message)
     VALUES ('33333333-3333-3333-3333-333333333333', 'alpha', 'signIn', 'success', NULL)`,
  );
}

// ---------------------------------------------------------------- 用例

/**
 * 用例顺序即业务顺序：先只读，后写，写入结果在后续读取里被验证。
 *
 * mode:
 *   exact —— 值 + 结构全比对（默认，用于所有 CRUD 与错误路径）
 *   shape —— 只比对结构指纹（值每次运行都不同）
 */
export const CASES = [
  ["GET", "/health", { auth: false, mode: "shape" }],
  ["GET", "/api/tokens", {}],
  ["POST", "/api/tokens", { body: { name: "gamma", token: "tok-gamma", roleId: "R3", enabled: true } }],
  ["GET", "/api/tokens", {}],
  ["GET", "/api/tokens", { auth: false }],
  ["GET", "/api/tasks", {}],
  ["POST", "/api/tasks", {
    body: {
      name: "daily",
      cron_expr: "30 4 * * *",
      selected_tokens: ["11111111-1111-1111-1111-111111111111"],
      selected_tasks: ["signIn", "climbTower"],
      enabled: true,
    },
  }],
  ["GET", "/api/tasks", {}],
  ["PATCH", "/api/tasks/33333333-3333-3333-3333-333333333333", { body: { enabled: false } }],
  ["DELETE", "/api/tasks/33333333-3333-3333-3333-333333333333", {}],
  ["GET", "/api/tasks", {}],
  ["GET", "/api/task-definitions", {}],
  ["GET", "/api/logs?limit=5", { mode: "shape" }],
  ["GET", "/api/logs/db?limit=5", {}],
  ["POST", "/api/tasks/does-not-exist/run", {}],
  ["DELETE", "/api/tokens/22222222-2222-2222-2222-222222222222", {}],
  ["GET", "/api/tokens", {}],
];

// ---------------------------------------------------------------- 执行

async function hit(base, method, path, { auth = true, body, mode = "exact" } = {}, apiKey) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (auth) headers["x-api-key"] = apiKey;
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return {
    status: res.status,
    contentType: res.headers.get("content-type")?.split(";")[0] ?? null,
    body: mode === "shape" ? shapeOf(parsed) : normalize(parsed),
  };
}

/**
 * 跑全部用例。会先重置 fixture，所以目标服务必须连同一个 DATABASE_URL。
 *
 * @param {{ base: string, apiKey?: string, onProgress?: (line: string) => void }} opts
 */
export async function runAll({ base, apiKey = API_KEY, onProgress } = {}) {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    await resetFixture(pool);
    const results = [];
    for (const [method, path, opts] of CASES) {
      const r = await hit(base, method, path, opts, apiKey);
      results.push({ request: `${method} ${path}`, ...r });
      onProgress?.(`${String(r.status).padEnd(4)} ${method.padEnd(6)} ${path}`);
    }
    return { base, caseCount: results.length, results };
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------- 差异

/** 用路径把两个对象的差异逐条列出，便于定位到底哪一条用例、哪一个字段变了。 */
export function diffResults(expected, actual) {
  const diffs = [];
  if (expected.caseCount !== actual.caseCount) {
    diffs.push(`用例数不一致: 基准 ${expected.caseCount} ≠ 实测 ${actual.caseCount}`);
  }
  const n = Math.min(expected.results.length, actual.results.length);
  for (let i = 0; i < n; i++) {
    const e = expected.results[i];
    const a = actual.results[i];
    if (JSON.stringify(e) === JSON.stringify(a)) continue;
    const fields = ["request", "status", "contentType", "body"];
    for (const f of fields) {
      const ev = JSON.stringify(e[f]);
      const av = JSON.stringify(a[f]);
      if (ev !== av) {
        diffs.push(`[#${i + 1} ${e.request}] ${f}\n  基准: ${truncate(ev)}\n  实测: ${truncate(av)}`);
      }
    }
  }
  return diffs;
}

function truncate(s, max = 600) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
