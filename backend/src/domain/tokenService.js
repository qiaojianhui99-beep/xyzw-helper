/**
 * Token 领域服务。
 *
 * 负责三件事：
 *   1. 写入时双写 —— 明文列 `token`（兼容前端直连与会话回放）+ 密文列 `token_enc`
 *   2. 读取给前端时只给安全字段（不含 token_enc）
 *   3. 读取给执行器时解密 —— 全库唯一拿明文的地方
 */

import { isSealed, mask, open, seal } from "../infra/crypto.js";
import { many, one, query } from "../infra/db.js";
import { logger } from "../infra/logger.js";
import { buildUpdate, id, toDbValue } from "../infra/sql.js";

/**
 * 允许写入的列。`token_enc` / `token_masked` 由本模块计算，不接受外部传入。
 */
export const TOKEN_WRITE_COLUMNS = [
  "id",
  "name",
  "token",
  "roleId",
  "sessId",
  "connId",
  "isRestore",
  "ws_url",
  "enabled",
  "created_at",
];

/**
 * 对外暴露的列。刻意排除 token_enc —— 密文不该出现在任何 HTTP 响应里。
 * 顺序与 001_init.sql 的建表顺序一致，保证 JSON 键序稳定。
 */
export const TOKEN_PUBLIC_COLUMNS = [
  "id",
  "name",
  "token",
  "roleId",
  "sessId",
  "connId",
  "isRestore",
  "ws_url",
  "enabled",
  "created_at",
];

const PUBLIC_SELECT = TOKEN_PUBLIC_COLUMNS.map((c) => id(c)).join(", ");

/** 列表：按 created_at 升序，只含公开列。 */
export async function listTokens() {
  return many(`SELECT ${PUBLIC_SELECT} FROM ${id("tokens")} ORDER BY created_at`);
}

/**
 * 创建（或按 id 覆盖）一个 Token。
 * 明文与密文同时落库；`token_masked` 供将来切换成纯 masked 下发时使用。
 *
 * @param {Record<string, unknown>} body
 * @returns {Promise<Record<string, unknown>>}
 */
export async function createToken(body) {
  const plain = typeof body.token === "string" ? body.token : "";
  const { cols, values, placeholders } = buildInsertValues(body);

  // 追加两列计算值
  if (plain) {
    cols.push("token_enc", "token_masked");
    values.push(JSON.stringify(seal(plain)), mask(plain));
    placeholders.push(`$${values.length - 1}`, `$${values.length}`);
  }

  const sql = `INSERT INTO ${id("tokens")} (${cols.map(id).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${PUBLIC_SELECT}`;
  const rows = await many(sql, values);
  return rows[0];
}

/**
 * 更新。token 变化时重新加密。
 * @param {string} tokenId
 * @param {Record<string, unknown>} body
 */
export async function updateToken(tokenId, body) {
  const plain = typeof body.token === "string" ? body.token : "";
  const built = buildUpdate("tokens", body, TOKEN_WRITE_COLUMNS, tokenId);

  if (plain) {
    // 在 UPDATE 里追加 token_enc / token_masked
    const extra = `, ${id("token_enc")} = $${built.values.length + 1}, ${id("token_masked")} = $${built.values.length + 2}`;
    built.sql = built.sql.replace(" WHERE ", `${extra} WHERE `);
    built.values.push(JSON.stringify(seal(plain)), mask(plain));
  }

  const rows = await many(built.sql, built.values);
  return rows[0] ?? null;
}

/** @param {string} tokenId */
export async function deleteToken(tokenId) {
  await query(`DELETE FROM ${id("tokens")} WHERE id = $1`, [tokenId]);
}

/**
 * 取执行用的 Token 行（含密文列与明文列）。
 * 这是唯一读取 `token_enc` 的地方。
 * @param {string} tokenId
 */
export async function getTokenRowForExecution(tokenId) {
  return one(`SELECT * FROM ${id("tokens")} WHERE id = $1`, [tokenId]);
}

/**
 * 把一行 token 记录解成 GameClient 需要的 tokenData。
 *
 * 优先级：token_enc（密文）→ token（明文列）。
 * 两者都拿不到明文时抛出明确错误 —— 不要静默用一个空 token 去连游戏服。
 *
 * @param {Record<string, any>} row
 * @returns {{ roleToken: string, roleId: any, sessId: any, connId: any, isRestore: any, name: string, wsUrl: string|null }}
 */
export function resolveCredentials(row) {
  let plain = null;

  if (isSealed(row.token_enc)) {
    plain = open(row.token_enc);
  } else if (typeof row.token === "string" && row.token.length > 0 && !row.token.includes("****")) {
    plain = row.token;
  }

  if (!plain) {
    throw new Error(`Token ${row.name ?? row.id} 无可用凭证（token_enc 与 token 均为空）`);
  }

  let parsed;
  if (typeof plain === "string" && plain.trim().startsWith("{")) {
    parsed = JSON.parse(plain);
  } else {
    parsed = {
      roleToken: plain,
      roleId: row.roleId,
      sessId: row.sessId,
      connId: row.connId,
      isRestore: row.isRestore,
    };
  }

  return {
    ...parsed,
    name: row.name,
    wsUrl: row.ws_url ?? null,
  };
}

/**
 * 兼容原版行为：请求体里带 id/created_at 时允许显式指定。
 * @param {Record<string, unknown>} body
 */
function buildInsertValues(body) {
  const cols = [];
  const values = [];
  const placeholders = [];
  for (const col of TOKEN_WRITE_COLUMNS) {
    if (!Object.hasOwn(body ?? {}, col)) continue;
    cols.push(col);
    values.push(toDbValue(body[col]));
    placeholders.push(`$${values.length}`);
  }
  return { cols, values, placeholders };
}

/**
 * 回填历史行的密文列（迁移用）：只处理 token_enc 为空且 token 是明文的行。
 * @returns {Promise<number>} 处理的行数
 */
export async function backfillEncryption() {
  const rows = await many(
    `SELECT id, token FROM ${id("tokens")} WHERE token_enc IS NULL AND token IS NOT NULL AND token <> ''`,
  );
  let count = 0;
  for (const row of rows) {
    await query(`UPDATE ${id("tokens")} SET token_enc = $1, token_masked = $2 WHERE id = $3`, [
      JSON.stringify(seal(row.token)),
      mask(row.token),
      row.id,
    ]);
    count += 1;
  }
  if (count > 0) logger.info("token", `已回填 ${count} 行密文`);
  return count;
}
