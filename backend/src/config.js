/**
 * 配置集中校验。启动即 fail-fast —— 缺变量时不要「跑起来一半」。
 *
 * 与原版 render-backend/server.js 的差别：原版用 dotenv + 直接读 process.env，
 * 缺 SUPABASE_URL 时会带着 undefined 一路跑下去，直到第一次查询才炸。
 */

import process from "node:process";

/** @param {string} name @param {string} [fallback] */
function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return v;
}

/** @param {string} name @param {number} fallback */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`环境变量 ${name} 必须是整数，实际 "${raw}"`);
  return n;
}

export const config = {
  /** API 进程监听端口。原版默认 3000；新版默认 3002 避免与前端 dev server 冲突。 */
  port: envInt("PORT", 3002),
  host: process.env.HOST || "0.0.0.0",

  /** Postgres 连接串。api 与 worker 可分别指向 transaction pooler / 直连。 */
  databaseUrl: env("DATABASE_URL", "postgresql://xyzw:xyzw_dev_pw@127.0.0.1:55432/xyzw"),
  dbPoolMax: envInt("DB_POOL_MAX", 10),

  /** 共享 API Key：与原版 createApiKeyMiddleware 保持一致（x-api-key 或 Bearer）。 */
  apiKey: env("API_KEY", "dev-api-key"),

  /** Token 加密主密钥（base64 的 32 字节）。为空时 S3 之前的明文模式，仅开发可用。 */
  tokenMasterKey: process.env.TOKEN_MASTER_KEY || "",
  tokenKeyId: process.env.TOKEN_KEY_ID || "k1",

  /** 内存日志上限，与原版 LOG_MAX 一致。 */
  logMax: envInt("LOG_MAX", 500),

  /** 单个 cron 任务允许的最大并发 Token 数（防止同一出口 IP 打爆游戏服）。 */
  maxConcurrentTokens: envInt("MAX_CONCURRENT_TOKENS", 2),

  isProd: process.env.NODE_ENV === "production",
};
