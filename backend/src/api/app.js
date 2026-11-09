/**
 * Fastify 应用装配。
 *
 * 对外暴露 buildApp()：返回未 listen 的实例，方便测试直接 inject / listen(0)。
 *
 * 与原版 Express 的对应关系：
 *   app.use(cors())              → @fastify/cors（origin: true，等价开放）
 *   app.use(express.json())      → 内置；bodyLimit 设 100kb 与 express.json 默认一致
 *   app.use("/api", 鉴权)        → /api 作用域内 preHandler
 *   默认 404 HTML                → JSON `{ error: "Not Found" }`
 *   默认错误处理                 → 统一 `{ error }`，并记录日志
 */

import process from "node:process";
import { pathToFileURL } from "node:url";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { config } from "../config.js";
import { mapPgError } from "../infra/db.js";
import { logger } from "../infra/logger.js";
import { authGuard } from "./plugins/authGuard.js";
import { healthRoute, logRoutes, metaRoutes } from "./routes/logs.js";
import { storageRoutes } from "./routes/storage.js";
import { taskRoutes } from "./routes/tasks.js";
import { tokenRoutes } from "./routes/tokens.js";

/** express.json() 默认 100kb；保持一致，避免超限行为差异。 */
const BODY_LIMIT = 100 * 1024;

/**
 * @param {{ logger?: boolean }} [opts]
 * @returns {Promise<import("fastify").FastifyInstance>}
 */
export async function buildApp(opts = {}) {
  const app = Fastify({
    bodyLimit: BODY_LIMIT,
    // 与 Express 一致：不因 content-type 不匹配而额外拒绝（由路由自行解读 body）
    // Fastify 默认会对空 body 的 POST 做处理，这里显式允许空 JSON。
    logger: opts.logger ?? false,
  });

  await app.register(cors, { origin: true });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "Not Found" });
  });

  app.setErrorHandler((err, req, reply) => {
    const mapped = mapPgError(err);
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : mapped.status;
    logger.error("api", `${req.method} ${req.url} 处理失败`, { error: err.message });
    reply.code(status).send({ error: err.message || mapped.message });
  });

  // /health 免鉴权
  await app.register(healthRoute);

  // /api 全部需要 API Key
  await app.register(
    async (scope) => {
      scope.addHook("preHandler", authGuard);
      await scope.register(tokenRoutes);
      await scope.register(taskRoutes);
      await scope.register(logRoutes);
      await scope.register(metaRoutes);
      await scope.register(storageRoutes);
    },
    { prefix: "/api" },
  );

  return app;
}

/**
 * 启动监听（生产入口用）。
 * @param {{ port?: number, host?: string }} [opts]
 */
export async function startServer(opts = {}) {
  const { registerAllCrons } = await import("../worker/scheduler.js");
  const app = await buildApp({ logger: false });

  await registerAllCrons();

  // 与原版一致：每 5 分钟重新加载定时任务配置
  const reloadTimer = setInterval(
    () => {
      registerAllCrons().catch((err) => {
        logger.error("cron", "重新加载定时任务失败", { error: err.message });
      });
    },
    5 * 60 * 1000,
  );
  reloadTimer.unref?.();

  app.addHook("onClose", async () => {
    clearInterval(reloadTimer);
  });

  const port = opts.port ?? config.port;
  const host = opts.host ?? config.host;
  await app.listen({ port, host });
  logger.info("server", `监听端口 ${port}`);
  return app;
}

// 直接 `node src/api/app.js` 时自启（用 pathToFileURL 比较，避免 Windows 盘符拼错）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
