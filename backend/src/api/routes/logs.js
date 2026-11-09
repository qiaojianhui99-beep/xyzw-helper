/**
 * 日志与元信息路由。
 *
 *   GET /health              200 `{ status, time, activeCrons, logsInMemory }`（免鉴权）
 *   GET /api/logs?limit=N    200 内存日志数组，limit 默认 100、上限 LOG_MAX
 *   GET /api/logs/db?limit=N 200 task_logs 数组，按 created_at 倒序，limit 上限 500
 *   GET /api/task-definitions 200 `[{ key, name, commands }]`
 */

import { config } from "../../config.js";
import { many } from "../../infra/db.js";
import { logCount, recentLogs } from "../../infra/logger.js";
import { listTaskDefinitions } from "../../protocol/taskDefinitions.js";
import { cronCount } from "../../worker/scheduler.js";

/** 与原版一致的宽松整数解析：非法值回落默认。 */
function parseLimit(raw, fallback, max) {
  const n = Number.parseInt(raw, 10);
  const base = Number.isNaN(n) ? fallback : n;
  return Math.min(base, max);
}

/**
 * @param {import("fastify").FastifyInstance} app
 */
export async function logRoutes(app) {
  app.get("/logs", async (req) => {
    const limit = parseLimit(req.query?.limit, 100, config.logMax);
    return recentLogs(limit);
  });

  app.get("/logs/db", async (req) => {
    const limit = parseLimit(req.query?.limit, 100, 500);
    return many(
      "SELECT * FROM task_logs ORDER BY created_at DESC LIMIT $1",
      [limit],
    );
  });
}

/**
 * @param {import("fastify").FastifyInstance} app
 */
export async function metaRoutes(app) {
  app.get("/task-definitions", async () => listTaskDefinitions());
}

/**
 * /health 免鉴权，因此单独注册在鉴权 scope 之外。
 * @param {import("fastify").FastifyInstance} app
 */
export async function healthRoute(app) {
  app.get("/health", async () => ({
    status: "ok",
    time: new Date().toISOString(),
    activeCrons: cronCount(),
    logsInMemory: logCount(),
  }));
}
