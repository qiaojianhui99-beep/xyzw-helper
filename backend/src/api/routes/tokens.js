/**
 * Token 路由。
 *
 * 与原版 render-backend/server.js 的 /api/tokens 行为对齐：
 *   GET    200  数组，按 created_at 升序
 *   POST   200  数组（含新行；原版是 200 不是 201）
 *   DELETE 200  `{ ok: true }`；失败 400 `{ error }`
 *
 * 实现经 tokenService：写入时双写明文列与密文列，但**响应只含公开列**，
 * 因此对拍基准里的字段集合完全不变。
 */

import {
  createToken,
  deleteToken,
  listTokens,
  TOKEN_PUBLIC_COLUMNS,
} from "../../domain/tokenService.js";
import { mapPgError, one } from "../../infra/db.js";
import { id } from "../../infra/sql.js";

const PUBLIC_SELECT = TOKEN_PUBLIC_COLUMNS.map((c) => id(c)).join(", ");

/**
 * @param {import("fastify").FastifyInstance} app
 */
export async function tokenRoutes(app) {
  app.get("/tokens", async () => listTokens());

  app.post("/tokens", async (req, reply) => {
    try {
      const row = await createToken(req.body ?? {});
      return [row];
    } catch (err) {
      const mapped = mapPgError(err);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

  app.delete("/tokens/:id", async (req, reply) => {
    try {
      await deleteToken(req.params.id);
      return { ok: true };
    } catch (err) {
      const mapped = mapPgError(err);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

  app.get("/tokens/:id", async (req) => {
    return one(`SELECT ${PUBLIC_SELECT} FROM ${id("tokens")} WHERE id = $1`, [req.params.id]);
  });
}
