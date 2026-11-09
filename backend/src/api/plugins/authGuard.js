/**
 * API Key 鉴权。
 *
 * 与原版 createApiKeyMiddleware 行为一致：
 *   - 接受 `x-api-key: <key>` 或 `authorization: Bearer <key>`
 *   - 未配置 key 或 key 不匹配 → 401 `{ error: "Unauthorized" }`
 *
 * 差异：用 timingSafeEqual 比较，避免逐字符短路泄露 key 前缀。
 * 响应体保持原样，所以 parity 测试不受影响。
 */

import { timingSafeEqual } from "node:crypto";
import { config } from "../../config.js";

/** @param {string} a @param {string} b */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 取单值 header；重复 header 在 Node 里可能是数组，取第一个与 Express 一致。 */
function headerValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Fastify preHandler：校验通过则放行，否则直接 401。
 * @param {import("fastify").FastifyRequest} req
 * @param {import("fastify").FastifyReply} reply
 */
export async function authGuard(req, reply) {
  const apiKey = headerValue(req.headers["x-api-key"]);
  const bearer = headerValue(req.headers.authorization)?.replace(/^Bearer\s+/i, "");
  const provided = apiKey || bearer;

  if (!config.apiKey || !provided || !safeEqual(provided, config.apiKey)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  return undefined;
}
