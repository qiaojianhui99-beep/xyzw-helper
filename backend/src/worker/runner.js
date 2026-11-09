/**
 * 任务执行器。
 *
 * 从 render-backend/server.js 的 executeTask 重构而来，行为保持一致：
 *   - selected_tokens / token_ids 双字段兼容
 *   - selected_tasks / task_type 双字段兼容
 *   - 命令按 cmd+params 去重
 *   - 每个 Token 单独建连、执行、断开
 *   - 每条命令结果写 task_logs
 *   - 结束后更新 cron_tasks.last_run_at
 *
 * 新增：
 *   - 全局并发闸（config.maxConcurrentTokens），避免同一出口 IP 打爆游戏服
 *   - Token 凭证经 tokenService 解密，不再直接从明文列取
 *   - 每条命令的耗时进日志，便于定位慢命令
 */

import { config } from "../config.js";
import { many, one, query } from "../infra/db.js";
import { logger } from "../infra/logger.js";
import { GameClient } from "../protocol/gameClient.js";
import { expandCommands } from "../protocol/taskDefinitions.js";
import { getTokenRowForExecution, resolveCredentials } from "../domain/tokenService.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 游戏客户端工厂。默认是真实 GameClient；测试可注入 fake，
 * 从而在不连游戏服的前提下验证「选 token → 展开命令 → 建连 → 执行 → 写日志」的编排逻辑。
 */
let clientFactory = (tokenData, wsUrl) => new GameClient(tokenData, wsUrl);

/** @param {(tokenData: any, wsUrl?: string) => any} fn */
export function setClientFactory(fn) {
  clientFactory = fn;
}

/** 恢复默认工厂（测试收尾用）。 */
export function resetClientFactory() {
  clientFactory = (tokenData, wsUrl) => new GameClient(tokenData, wsUrl);
}

/** 把 jsonb 列或字符串统一成数组。 */
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 写一条任务日志。失败只告警，不打断执行（与原版一致）。
 * @param {string} taskId
 * @param {string} tokenName
 * @param {string} taskType
 * @param {"success"|"error"|"skipped"} status
 * @param {string|null} [message]
 * @param {number|null} [durationMs]
 */
async function logToDb(taskId, tokenName, taskType, status, message, durationMs = null) {
  try {
    await query(
      `INSERT INTO task_logs (task_id, token_name, task_type, status, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [taskId, tokenName, taskType, status, message ?? null],
    );
    if (durationMs !== null) {
      logger.debug("task", `[${tokenName}] ${taskType} ${status} ${durationMs}ms`);
    }
  } catch (err) {
    logger.error("task", "写入日志失败", { error: err.message });
  }
}

/** 简单并发闸：把数组按 size 分片，逐片串行执行片内并发。 */
async function runWithConcurrency(items, size, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    results.push(...(await Promise.all(slice.map((it) => worker(it)))));
  }
  return results;
}

/**
 * 执行单个 Token 上的全部命令。
 * @param {Record<string, any>} tokenRow
 * @param {Array<{cmd: string, params: object}>} commands
 * @param {string} taskId
 * @returns {Promise<{token: string, ok: number, failed: number}>}
 */
async function runOneToken(tokenRow, commands, taskId) {
  let tokenData;
  try {
    tokenData = resolveCredentials(tokenRow);
  } catch (err) {
    logger.error("task", `Token 解析失败: ${tokenRow.name}`, { error: err.message });
    await logToDb(taskId, tokenRow.name, "resolve", "error", err.message);
    return { token: tokenRow.name, ok: 0, failed: 1 };
  }

  const client = clientFactory(tokenData, tokenData.wsUrl ?? undefined);
  let ok = 0;
  let failed = 0;

  try {
    await client.connect(15000);

    // 先取角色信息，确认会话可用；失败不阻断（与原版一致）
    try {
      await client.sendWithPromise("role_getroleinfo", {}, 8000);
      await sleep(500);
    } catch (err) {
      logger.warn("task", `获取角色信息失败 (${tokenData.name})`, { error: err.message });
    }

    const results = await client.executeBatch(commands, 800);
    for (const r of results) {
      if (r.success) ok += 1;
      else failed += 1;
      await logToDb(
        taskId,
        tokenData.name,
        r.cmd,
        r.success ? "success" : "error",
        r.success ? null : r.error,
      );
    }
  } catch (err) {
    failed += 1;
    logger.error("task", `执行失败 (${tokenData.name}): ${err.message}`);
    await logToDb(taskId, tokenData.name, commands.map((c) => c.cmd).join(","), "error", err.message);
  } finally {
    client.disconnect();
  }

  return { token: tokenData.name, ok, failed };
}

/**
 * 执行一个定时任务。
 * @param {Record<string, any>} task cron_tasks 行
 * @returns {Promise<{taskId: string, tokens: number, ok: number, failed: number, skipped: string[]}>}
 */
export async function executeTask(task) {
  const started = Date.now();
  logger.info("task", `开始执行任务: ${task.name}`, { taskId: task.id });

  // 1. 目标 Token
  const tokenIds = asArray(task.selected_tokens ?? task.token_ids);
  if (tokenIds.length === 0) {
    logger.warn("task", "没有选中的 token，跳过", { taskId: task.id });
    await logToDb(task.id, "-", "select", "skipped", "没有选中的 token");
    return { taskId: task.id, tokens: 0, ok: 0, failed: 0, skipped: ["no-tokens"] };
  }

  // 2. 任务类型 → 命令
  let taskKeys = asArray(task.selected_tasks);
  if (taskKeys.length === 0 && task.task_type) taskKeys = [task.task_type];
  if (taskKeys.length === 0) {
    logger.error("task", "没有选择任何任务类型", { taskId: task.id });
    await logToDb(task.id, "-", "select", "error", "没有选择任何任务类型");
    return { taskId: task.id, tokens: 0, ok: 0, failed: 0, skipped: ["no-task-keys"] };
  }

  const { commands, unknownKeys } = expandCommands(taskKeys);
  for (const key of unknownKeys) {
    logger.warn("task", `未知任务类型: ${key}，跳过`, { taskId: task.id });
  }
  if (commands.length === 0) {
    logger.error("task", "没有有效的命令可执行", { taskId: task.id });
    await logToDb(task.id, "-", taskKeys.join(","), "error", "没有有效的命令可执行");
    return { taskId: task.id, tokens: 0, ok: 0, failed: 0, skipped: unknownKeys };
  }

  // 3. 读取目标 Token 行
  const rows = await many(
    `SELECT * FROM tokens WHERE id = ANY($1::uuid[])`,
    [tokenIds],
  );
  if (rows.length === 0) {
    logger.warn("task", "没有找到匹配的 tokens", { taskId: task.id });
    await logToDb(task.id, "-", "select", "skipped", "没有找到匹配的 tokens");
    return { taskId: task.id, tokens: 0, ok: 0, failed: 0, skipped: ["tokens-not-found"] };
  }

  logger.info("task", `将执行于 ${rows.length} 个角色（并发 ${config.maxConcurrentTokens}）`, {
    taskId: task.id,
  });

  // 4. 限并发执行
  const results = await runWithConcurrency(rows, config.maxConcurrentTokens, (row) =>
    runOneToken(row, commands, task.id),
  );

  // 5. 收尾
  await query(`UPDATE cron_tasks SET last_run_at = now() WHERE id = $1`, [task.id]);
  const ok = results.reduce((s, r) => s + r.ok, 0);
  const failed = results.reduce((s, r) => s + r.failed, 0);
  logger.info("task", `任务完成: ${task.name}（成功 ${ok} / 失败 ${failed}）`, {
    taskId: task.id,
    durationMs: Date.now() - started,
  });

  return { taskId: task.id, tokens: results.length, ok, failed, skipped: unknownKeys };
}

/**
 * 按 id 取任务并执行（HTTP run 端点用）。
 * @param {string} taskId
 */
export async function executeTaskById(taskId) {
  const task = await one("SELECT * FROM cron_tasks WHERE id = $1", [taskId]);
  if (!task) throw new Error(`任务不存在: ${taskId}`);
  return executeTask(task);
}
