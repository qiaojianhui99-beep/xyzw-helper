/**
 * 定时任务调度（node-cron）。
 *
 * 从 render-backend/server.js 的 registerCron / registerAllCrons 抽出来，
 * 行为保持一致：按 cron_expr 注册、时区固定 Asia/Shanghai、重载时先 stop 旧的。
 *
 * S4 会把「执行」搬进独立 worker 进程；在此之前它仍在本进程内运行，
 * 因此对外接口（注册/重载/计数）刻意设计成与进程归属无关。
 */

import cron from "node-cron";
import { many } from "../infra/db.js";
import { logger } from "../infra/logger.js";

const TZ = "Asia/Shanghai";

/** @type {Map<string, import("node-cron").ScheduledTask>} */
const jobs = new Map();

/** 由 worker 注入的执行函数；未注入时任务只记录不执行（避免 api 进程意外跑任务）。 */
let executeFn = null;

/** @param {((task: any) => Promise<void>) | null} fn */
export function setExecutor(fn) {
  executeFn = fn;
}

export function cronCount() {
  return jobs.size;
}

/**
 * 注册单个任务。字段兼容新旧两套命名（cron_expr / cron_expression），
 * 与改造前 server.js 的兼容逻辑保持一致。
 * @param {any} task
 */
export function registerCron(task) {
  const existing = jobs.get(task.id);
  if (existing) existing.stop();

  const expr = task.cron_expr || task.cron_expression;
  if (!task.enabled || !expr) {
    jobs.delete(task.id);
    return;
  }

  try {
    const job = cron.schedule(
      expr,
      () => {
        if (!executeFn) {
          logger.info("cron", `任务到点但无执行器: ${task.name}`);
          return;
        }
        executeFn(task).catch((err) => {
          logger.error("cron", `任务执行异常: ${task.name}`, { error: err.message });
        });
      },
      { timezone: TZ },
    );
    jobs.set(task.id, job);
    logger.info("cron", `注册定时任务: ${task.name} (${expr} ${TZ})`);
  } catch (err) {
    logger.error("cron", `注册失败: ${task.name}`, { error: err.message });
  }
}

/** 重新从数据库加载全部任务。 */
export async function registerAllCrons() {
  for (const job of jobs.values()) job.stop();
  jobs.clear();

  const tasks = await many("SELECT * FROM cron_tasks WHERE enabled = true");
  for (const task of tasks) registerCron(task);
  logger.info("cron", `已注册 ${tasks.length} 个定时任务`);
  return tasks.length;
}

/** 停止全部任务（优雅关闭用）。 */
export function stopAllCrons() {
  for (const job of jobs.values()) job.stop();
  jobs.clear();
}
