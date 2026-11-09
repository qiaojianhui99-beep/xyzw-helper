/**
 * WebSocket 握手诊断：定位「连接建立后被立刻 1006 关闭」的原因。
 *
 * 逐个变量试：User-Agent / Origin / Sec-WebSocket-Protocol / 是否发 ping。
 * 谁能维持连接超过 5 秒，就说明服务端校验的是哪一个。
 *
 *   XYZW_TOKEN_JSON='{...}' node backend/scripts/_handshake-probe.mjs
 */

import process from "node:process";
import WebSocket from "ws";

const t = JSON.parse(process.env.XYZW_TOKEN_JSON);
const HOST = "wss://xxz-xyzw.hortorgames.com/agent";
const URL_PLAIN = `${HOST}?p=${encodeURIComponent(t.roleToken)}&e=x&lang=chinese`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** 每种组合：名字 + 建连选项 + URL */
const VARIANTS = [
  { name: "裸连（当前 gameClient 行为）", opts: {}, url: URL_PLAIN },
  { name: "+User-Agent", opts: { headers: { "User-Agent": UA } }, url: URL_PLAIN },
  { name: "+Origin", opts: { origin: "http://localhost:3000" }, url: URL_PLAIN },
  { name: "+UA +Origin", opts: { headers: { "User-Agent": UA }, origin: "http://localhost:3000" }, url: URL_PLAIN },
  { name: "+UA +Origin +Sec-WebSocket-Protocol", opts: { headers: { "User-Agent": UA }, origin: "http://localhost:3000", protocol: "websocket" }, url: URL_PLAIN },
  { name: "+UA +Origin +Accept-Language", opts: { headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" }, origin: "http://localhost:3000" }, url: URL_PLAIN },
];

function tryOne({ name, opts, url }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let openedAt = null;
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({ name, ...result, elapsed: Date.now() - t0, openedAt });
    };

    let ws;
    try {
      ws = new WebSocket(url, opts.protocol ?? [], opts);
    } catch (err) {
      return resolve({ name, outcome: `建连抛错: ${err.message}` });
    }

    // 5 秒内没被关闭就算「握手通过」
    const guard = setTimeout(() => done({ outcome: "保持 5 秒未断 ✓" }), 5000);

    ws.on("open", () => {
      openedAt = Date.now() - t0;
    });
    ws.on("close", (code, reason) => {
      done({ outcome: `关闭 ${code} ${reason?.toString() || ""}`.trim() });
    });
    ws.on("error", (err) => {
      done({ outcome: `错误: ${err.message}` });
    });
  });
}

for (const v of VARIANTS) {
  const r = await tryOne(v);
  const head = r.openedAt != null ? `open@${r.openedAt}ms ` : "";
  console.log(`${r.outcome.padEnd(22)} ${head}← ${r.name}`);
  await new Promise((r2) => setTimeout(r2, 600));
}
