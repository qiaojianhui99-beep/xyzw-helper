/**
 * 真实游戏服连通性探测（只读）。
 *
 * 只发 `role_getroleinfo` 一条只读命令，不签到、不领奖、不改任何游戏状态。
 * Token 从环境变量 XYZW_TOKEN_JSON 读，绝不落盘、绝不打进日志全文。
 *
 *   XYZW_TOKEN_JSON='{"roleToken":"...","roleId":123,...}' \
 *     node backend/scripts/probe-live-token.mjs [--mode=plain|json]
 *
 * --mode=plain（默认）: p=<纯 roleToken>          —— 与前端 tokenStore.ts:789 一致
 * --mode=json         : p=<JSON 对象>             —— 原 render-backend/gameClient.js 的做法
 *
 * 目的：补齐「改造前后功能一致」里唯一无法用 mock 覆盖的一层 ——
 *       真实 BON 协议 + 真实鉴权 + 真实服务端应答。
 */

import process from "node:process";
import { GameClient } from "../../render-backend/lib/gameClient.js";

const GAME_HOST = "wss://xxz-xyzw.hortorgames.com/agent";

/** 凭证类字段只留前 8 位，避免探测输出被复制粘贴后泄露。 */
function mask(v) {
  if (typeof v !== "string" || v.length <= 8) return typeof v;
  return `${v.slice(0, 8)}…(${v.length})`;
}

function summarize(obj, depth = 0) {
  if (obj === null || typeof obj !== "object") return obj;
  if (depth > 2) return Array.isArray(obj) ? `[${obj.length} items]` : "{…}";
  if (Array.isArray(obj)) return obj.slice(0, 3).map((x) => summarize(x, depth + 1));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, 20)) {
    out[k] = typeof v === "object" ? summarize(v, depth + 1) : v;
  }
  return out;
}

function argValue(flag, fallback) {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : fallback;
}

async function main() {
  const mode = argValue("--mode", "plain");
  const raw = process.env.XYZW_TOKEN_JSON;
  if (!raw) {
    console.error("缺少 XYZW_TOKEN_JSON 环境变量");
    process.exitCode = 1;
    return;
  }

  let tokenData;
  try {
    tokenData = JSON.parse(raw);
  } catch (err) {
    console.error("XYZW_TOKEN_JSON 不是合法 JSON:", err.message);
    process.exitCode = 1;
    return;
  }

  console.log("凭证形状:", {
    roleToken: mask(tokenData.roleToken),
    roleId: tokenData.roleId,
    sessId: tokenData.sessId,
    connId: tokenData.connId,
    isRestore: tokenData.isRestore,
  });

  // p 参数的两种构造方式，差异就是本次探测要回答的问题
  const p =
    mode === "json"
      ? JSON.stringify({
          roleToken: tokenData.roleToken,
          roleId: tokenData.roleId,
          sessId: tokenData.sessId,
          connId: tokenData.connId,
          isRestore: tokenData.isRestore,
        })
      : tokenData.roleToken;

  const wsUrl = `${GAME_HOST}?p=${encodeURIComponent(p)}&e=x&lang=chinese`;
  console.log(`URL 模式: ${mode}（p 长度 ${p.length}）`);

  tokenData.name = "probe";
  const client = new GameClient(tokenData, wsUrl);
  const t0 = Date.now();

  try {
    await client.connect(15000);
    console.log(`连接成功（${Date.now() - t0} ms）`);

    const t1 = Date.now();
    const info = await client.sendWithPromise("role_getroleinfo", {}, 10000);
    console.log(`role_getroleinfo 成功（${Date.now() - t1} ms）`);
    console.log("应答摘要:", JSON.stringify(summarize(info), null, 2));
  } catch (err) {
    console.error("探测失败:", err?.message || err);
    process.exitCode = 1;
  } finally {
    client.disconnect();
  }
}

main();
