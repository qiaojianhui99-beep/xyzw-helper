/**
 * 定时任务路由。
 *
 * 与原版行为对齐：
 *   GET    200  数组，按 created_at 升序
 *   POST   200  数组；并注册 cron
 *   PATCH  200  数组；并重新加载全部 cron
 *   DELETE 200  `{ ok: true }`；并重新加载全部 cron
 *   POST /:id/run  200 `{ status: "running", task: name }`；任务不存在 404 `{ error: "任务不存在" }`
 *
 * 注意：原版 run 返回 200 而非 202，且执行是异步的 —— 必须保持一致，
 * 否则前端按钮的加载状态判断会变。
 */

import { many, mapPgError, one, query } from "../../infra/db.js";
import { logger } from "../../infra/logger.js";
import { buildInsert, buildUpdate, id } from "../../infra/sql.js";
import { registerAllCrons, registerCron } from "../../worker/scheduler.js";

/** 可写列白名单，含新旧两套字段名（保持与原版兼容逻辑一致）。 */
export const TASK_COLUMNS = [
  "id",
  "name",
  "cron_expr",
  "cron_expression",
  "selected_tokens",
  "token_ids",
  "selected_tasks",
  "task_type",
  "enabled",
  "last_run_at",
  "created_at",
];

/** 由 worker 注入；api 进程里未注入时 run 只发「无执行器」提示。 */
let runTaskFn = null;

/** @param {((task: any) => Promise<void>) | null} fn */
export function setTaskRunner(fn) {
  runTaskFn = fn;
}

/**
 * @param {import("fastify").FastifyInstance} app
 */
export async function taskRoutes(app) {
  app.get("/tasks", async () => {
    return many("SELECT * FROM cron_tasks ORDER BY created_at");
  });

  app.post("/tasks", async (req, reply) => {
    const { sql, values } = buildInsert("cron_tasks", req.body ?? {}, TASK_COLUMNS);
    try {
      const rows = await many(sql, values);
      if (rows[0]) registerCron(rows[0]);
      return rows;
    } catch (err) {
      const mapped = mapPgError(err);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

  app.patch("/tasks/:id", async (req, reply) => {
    const { sql, values } = buildUpdate("cron_tasks", req.body ?? {}, TASK_COLUMNS, req.params.id);
    try {
      const rows = await many(sql, values);
      await registerAllCrons();
      return rows;
    } catch (err) {
      const mapped = mapPgError(err);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

  app.delete("/tasks/:id", async (req, reply) => {
    try {
      await query(`DELETE FROM ${id("cron_tasks")} WHERE id = $1`, [req.params.id]);
      await registerAllCrons();
      return { ok: true };
    } catch (err) {
      const mapped = mapPgError(err);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

  app.post("/tasks/:id/run", async (req, reply) => {
    let task = null;
    try {
      task = await one("SELECT * FROM cron_tasks WHERE id = $1", [req.params.id]);
    } catch {
      // 非 uuid 的 id 会抛 22P02；原版经 supabase 返回 error，data 为 null → 走 404 分支
      task = null;
    }
    if (!task) return reply.code(404).send({ error: "任务不存在" });

    if (!runTaskFn) {
      logger.warn("api", `手动执行但没有注入执行器: ${task.name}`);
      return { status: "running", task: task.name };
    }

    runTaskFn(task).catch((err) => {
      logger.error("api", `手动执行失败: ${err.message}`);
    });
    return { status: "running", task: task.name };
  });
}
