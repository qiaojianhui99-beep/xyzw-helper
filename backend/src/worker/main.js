/**
 * Worker 进程入口。
 *
 * 与 api 进程的分工：
 *   api    —— 无状态 HTTP，可水平扩
 *   worker —— 单实例，独占 cron 调度与游戏服连接，持 Token 解密入口
 *
 * 启动顺序刻意如此：
 *   1. 抢 advisory lock —— 抢不到说明已有 worker，本进程立刻退出（不重复执行任务）
 *   2. 验证会话级锁真的有效 —— 防止连到 Supabase transaction pooler 导致锁形同虚设
 *   3. 注入执行器 + 注册 cron
 *   4. 挂定时维护（重载配置、清理旧日志）
 *
 * 优雅关闭：收到 SIGINT/SIGTERM 后停止 cron、等在跑的任务结束、释放锁、关连接池。
 */

import process from "node:process";
import { config } from "../config.js";
import { closePool, query } from "../infra/db.js";
import { encryptionEnabled } from "../infra/crypto.js";
import { logger } from "../infra/logger.js";
import { acquireWorkerLock, releaseWorkerLock, verifySessionLockSupport } from "./lock.js";
import { registerAllCrons, setExecutor, stopAllCrons } from "./scheduler.js";
import { executeTask } from "./runner.js";

/** 正在执行的任务数：关闭时要等它们归零。 */
let inFlight = 0;
let shuttingDown = false;

/** 包装执行器，负责在飞计数与关闭期拒绝新任务。 */
async function wrappedExecute(task) {
  if (shuttingDown) {
    logger.warn("worker", `关闭中，跳过任务: ${task.name}`);
    return;
  }
  inFlight += 1;
  try {
    await executeTask(task);
  } finally {
    inFlight -= 1;
  }
}

/** 删除前一天及更早的任务日志（与原版每日 12:00 清理等价）。 */
async function cleanupOldLogs() {
  try {
    const { rowCount } = await query(
      `DELETE FROM task_logs WHERE created_at < (date_trunc('day', now()) - interval '1 day')`,
    );
    logger.info("cron", `已清理 ${rowCount} 条历史任务日志`);
  } catch (err) {
    logger.error("cron", "日志清理失败", { error: err.message });
  }
}

/** 等到在飞任务归零，最多等 timeoutMs。 */
async function drain(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (inFlight > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return inFlight === 0;
}

async function main() {
  logger.info("worker", "启动中");

  if (!encryptionEnabled) {
    logger.warn("worker", "TOKEN_MASTER_KEY 未配置 —— 处于明文模式，仅可用于本地开发");
  }

  const gotLock = await acquireWorkerLock();
  if (!gotLock) {
    logger.error("worker", "另一个 worker 实例已持有调度锁，本进程退出");
    await closePool();
    process.exitCode = 1;
    return;
  }
  logger.info("worker", "已获得调度锁");

  const support = await verifySessionLockSupport();
  if (!support.ok) {
    logger.warn("worker", support.detail);
  }

  setExecutor(wrappedExecute);
  const count = await registerAllCrons();
  logger.info("worker", `就绪，已加载 ${count} 个定时任务`);

  const reloadTimer = setInterval(
    () => {
      if (shuttingDown) return;
      registerAllCrons().catch((err) => {
        logger.error("cron", "重新加载定时任务失败", { error: err.message });
      });
    },
    5 * 60 * 1000,
  );
  reloadTimer.unref?.();

  // 每天 12:00（Asia/Shanghai）清理历史日志
  const { default: cron } = await import("node-cron");
  const cleanupJob = cron.schedule("0 12 * * *", cleanupOldLogs, { timezone: "Asia/Shanghai" });
  cleanupJob.start?.();

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("worker", `收到 ${signal}，开始优雅关闭`);

    clearInterval(reloadTimer);
    cleanupJob.stop();
    stopAllCrons();

    const drained = await drain(10000);
    logger.info("worker", drained ? "在飞任务已全部结束" : `仍有 ${inFlight} 个任务未结束，强制退出`);

    await releaseWorkerLock();
    await closePool();
    logger.info("worker", "已关闭");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  logger.info("worker", `配置: 并发 ${config.maxConcurrentTokens} 个角色/任务`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
