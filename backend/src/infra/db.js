/**
 * Postgres 访问层。
 *
 * 只做三件事：连接池、类型对齐、错误码映射。
 * 不引入 ORM —— 这个项目只有少量表，裸 SQL 更短也更容易读出问题。
 */

import pg from "pg";
import { config } from "../config.js";

const { Pool, types } = pg;

// ---------------------------------------------------------------------------
// 类型对齐：PostgREST 走 HTTP + JSON，数字就是 JSON number；
// node-postgres 默认把 int8/numeric 返回成字符串（防 2^53 精度丢失）。
// 不对齐会让 task_logs.id 从 1 变成 "1"，与改造前行为不一致。
// ---------------------------------------------------------------------------
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
});

pool.on("error", (err) => {
  console.error(JSON.stringify({ level: "ERROR", category: "db", message: "空闲连接异常", error: err.message }));
});

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * 取单行；没有行返回 null（不抛错）。
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function one(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/**
 * 取多行。
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function many(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/**
 * 把 PG 错误码翻译成 HTTP 语义。
 *
 * 原版通过 supabase 的 `{ error }` 统一返回 400/500，这里保持一致：
 * 约束类错误 → 400（原版 insert 失败走 `res.status(400)`），其余 → 500。
 *
 * @param {any} err
 * @returns {{ status: number, code: string, message: string }}
 */
export function mapPgError(err) {
  const code = err?.code;
  switch (code) {
    case "23505":
      return { status: 400, code: "DUPLICATE", message: err.message };
    case "23503":
      return { status: 400, code: "FK_MISSING", message: err.message };
    case "23502":
      return { status: 400, code: "NOT_NULL_VIOLATION", message: err.message };
    case "23514":
      return { status: 400, code: "CHECK_FAILED", message: err.message };
    case "22P02":
      return { status: 400, code: "INVALID_TEXT_REPRESENTATION", message: err.message };
    default:
      return { status: 500, code: "DB_ERROR", message: err?.message || "数据库错误" };
  }
}

/** 进程退出前释放连接池。 */
export async function closePool() {
  await pool.end();
}
