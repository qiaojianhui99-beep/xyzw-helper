/**
 * 跨进程互斥锁（Postgres advisory lock）。
 *
 * 用会话级 `pg_try_advisory_lock`：锁随连接生命周期存在，进程崩溃时由 PG 自动释放。
 *
 * 重要：Supabase 的 **transaction pooler（6543 端口）不支持会话级 advisory lock**，
 * 每个事务结束后连接归还、锁立即释放，等于没锁。worker 必须连 5432
 * （session pooler / 直连 / 自建 Postgres）。config 里不做强制校验，因为
 * 「连错端口」只会表现为锁形同虚设；这里在启动时主动探测并告警。
 */

import { pool } from "../infra/db.js";
import { logger } from "../infra/logger.js";

/** 固定 magic number，避免与其他用途的 advisory lock 撞号。 */
const WORKER_LOCK_KEY = 8472913;

let locked = false;

/**
 * 尝试获取 worker 独占锁。
 * @returns {Promise<boolean>} true = 本进程成为唯一 worker
 */
export async function acquireWorkerLock() {
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS ok", [WORKER_LOCK_KEY]);
  locked = Boolean(rows[0]?.ok);
  return locked;
}

/**
 * 探测会话级锁是否真的有效。
 * transaction pooler 下同一会话拿两次锁会失败，这里用「同一连接重复加锁应成功」来判断。
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function verifySessionLockSupport() {
  const client = await pool.connect();
  try {
    const first = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [WORKER_LOCK_KEY + 1]);
    const second = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [WORKER_LOCK_KEY + 1]);
    const bothOk = Boolean(first.rows[0]?.ok) && Boolean(second.rows[0]?.ok);
    await client.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK_KEY + 1]);
    return bothOk
      ? { ok: true, detail: "会话级 advisory lock 可用" }
      : { ok: false, detail: "会话级 advisory lock 不可用（很可能连到了 transaction pooler 6543 端口）" };
  } finally {
    client.release();
  }
}

/** 释放锁（进程退出前调用）。 */
export async function releaseWorkerLock() {
  if (!locked) return;
  try {
    await pool.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK_KEY]);
    locked = false;
  } catch (err) {
    logger.warn("worker", `释放锁失败: ${err.message}`);
  }
}

export function isLocked() {
  return locked;
}
