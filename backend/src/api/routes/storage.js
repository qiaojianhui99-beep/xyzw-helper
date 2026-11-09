/**
 * 通用存储同步端点。
 *
 * 配合前端 src/api/storage.js：
 *   GET  /api/storage/all    → `{ key: value }`，登录后 boot 时全量拉取
 *   POST /api/storage/patch  → `{ patch: { key: value|null } }`，写穿同步
 *
 * value 为 null 表示删除该键。
 *
 * 安全约束（与前端 NEVER_SYNC 呼应的第二道闸）：
 * 服务端也拒绝接收进程级/本机状态类键 —— 即使前端逻辑被改坏，
 * 也不该让 activeConnections 之类的运行时状态跨设备串味。
 */

import { many, query } from "../../infra/db.js";
import { logger } from "../../infra/logger.js";

/** 服务端侧黑名单（与前端 storage.js 的 NEVER_SYNC 保持同源语义）。 */
const REJECTED_PREFIXES = [
  "activeConnections",
  "bin_data_",
  "ws_connection_",
  "xyzw_chat_msg_list",
  "test",
  "daily-settings:",
];

/** @param {string} key */
function rejected(key) {
  return REJECTED_PREFIXES.some((p) => (p.endsWith("_") || p.endsWith(":") ? key.startsWith(p) : key === p));
}

/** 单次 patch 的键数上限，防止一次写入把库撑爆。 */
const MAX_PATCH_KEYS = 200;

/**
 * @param {import("fastify").FastifyInstance} app
 */
export async function storageRoutes(app) {
  app.get("/storage/all", async () => {
    const rows = await many("SELECT key, value FROM user_storage WHERE value IS NOT NULL");
    /** @type {Record<string, string>} */
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  });

  app.post("/storage/patch", async (req, reply) => {
    const patch = req.body?.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return reply.code(400).send({ error: "patch 必须是对象" });
    }

    const keys = Object.keys(patch);
    if (keys.length > MAX_PATCH_KEYS) {
      return reply.code(400).send({ error: `单次最多同步 ${MAX_PATCH_KEYS} 个键` });
    }

    let applied = 0;
    const skipped = [];

    for (const key of keys) {
      if (rejected(key)) {
        skipped.push(key);
        continue;
      }
      const value = patch[key];
      if (value === null || value === undefined) {
        await query("DELETE FROM user_storage WHERE key = $1", [key]);
      } else {
        await query(
          `INSERT INTO user_storage (key, value, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, String(value)],
        );
      }
      applied += 1;
    }

    if (skipped.length > 0) {
      logger.warn("storage", `拒绝同步 ${skipped.length} 个进程级键`, { skipped });
    }

    return { ok: true, applied, skipped };
  });

  app.get("/storage/:key", async (req, reply) => {
    const rows = await many("SELECT value FROM user_storage WHERE key = $1", [req.params.key]);
    if (rows.length === 0) return reply.code(404).send({ error: "Not Found" });
    return { key: req.params.key, value: rows[0].value };
  });
}
