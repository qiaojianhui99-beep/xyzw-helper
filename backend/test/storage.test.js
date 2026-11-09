/**
 * 存储同步端点测试。
 *
 * 重点验证两道闸：
 *   1. 正常键值能往返（前端 hydration 依赖）
 *   2. 进程级键会被服务端拒绝（即使前端逻辑被改坏也不能串味）
 */

import assert from "node:assert/strict";
import process from "node:process";
import { after, before, beforeEach, describe, it } from "node:test";
import { buildApp } from "../src/api/app.js";
import { closePool, pool } from "../src/infra/db.js";

const API_KEY = process.env.API_KEY || "dev-api-key";

/** @type {import("fastify").FastifyInstance} */
let app;

before(async () => {
  app = await buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  await closePool();
});

beforeEach(async () => {
  await pool.query("TRUNCATE user_storage");
});

function auth(opts = {}) {
  return { ...opts, headers: { "x-api-key": API_KEY, ...(opts.headers ?? {}) } };
}

async function patch(body) {
  return app.inject(auth({ method: "POST", url: "/api/storage/patch", payload: body }));
}

describe("GET /api/storage/all", () => {
  it("空库返回空对象", async () => {
    const res = await app.inject(auth({ method: "GET", url: "/api/storage/all" }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {});
  });

  it("返回已写入的键值", async () => {
    await patch({ patch: { theme: "dark", tokenViewMode: "card" } });
    const res = await app.inject(auth({ method: "GET", url: "/api/storage/all" }));
    const body = JSON.parse(res.body);
    assert.deepEqual(
      Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v.value])),
      { theme: "dark", tokenViewMode: "card" },
    );
    for (const entry of Object.values(body)) {
      assert.equal(typeof entry.updatedAt, "string", "必须带 updatedAt，前端靠它判谁更新");
      assert.ok(!Number.isNaN(Date.parse(entry.updatedAt)));
    }
  });

  it("需要鉴权", async () => {
    const res = await app.inject({ method: "GET", url: "/api/storage/all" });
    assert.equal(res.statusCode, 401);
  });
});

describe("POST /api/storage/patch", () => {
  it("写入并返回 applied 数量", async () => {
    const res = await patch({ patch: { theme: "dark", a: "1" } });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.applied, 2);
    assert.deepEqual(body.skipped, []);
  });

  it("重复写入同一键是 upsert，不报错", async () => {
    await patch({ patch: { theme: "dark" } });
    await patch({ patch: { theme: "light" } });
    const res = await app.inject(auth({ method: "GET", url: "/api/storage/all" }));
    const body = JSON.parse(res.body);
    assert.equal(body.theme.value, "light", "重复写入应 upsert 成最新值");
  });

  it("null 表示删除", async () => {
    await patch({ patch: { theme: "dark" } });
    await patch({ patch: { theme: null } });
    const res = await app.inject(auth({ method: "GET", url: "/api/storage/all" }));
    assert.deepEqual(JSON.parse(res.body), {});
  });

  it("value 原样保留字符串（不做二次 JSON 编码）", async () => {
    const json = JSON.stringify([{ id: "a", n: 1 }]);
    await patch({ patch: { gameTokens: json } });
    const res = await app.inject(auth({ method: "GET", url: "/api/storage/all" }));
    assert.equal(JSON.parse(res.body).gameTokens.value, json);
  });

  it("进程级键被拒绝并回显在 skipped", async () => {
    const res = await patch({
      patch: {
        theme: "dark",
        activeConnections: "{}",
        "bin_data_x": "ff",
        "ws_connection_y": "1",
        "daily-settings:123": "{}",
        test: "t",
      },
    });
    const body = JSON.parse(res.body);
    assert.equal(body.applied, 1, "只有 theme 应被写入");
    assert.equal(body.skipped.length, 5);
    assert.ok(body.skipped.includes("activeConnections"));

    const all = await app.inject(auth({ method: "GET", url: "/api/storage/all" }));
    assert.deepEqual(Object.keys(JSON.parse(all.body)), ["theme"]);
  });

  it("patch 不是对象 → 400", async () => {
    const res = await patch({ patch: ["a"] });
    assert.equal(res.statusCode, 400);
  });

  it("缺 patch 字段 → 400", async () => {
    const res = await patch({ other: 1 });
    assert.equal(res.statusCode, 400);
  });

  it("超过 200 个键 → 400", async () => {
    /** @type {Record<string, string>} */
    const big = {};
    for (let i = 0; i < 201; i++) big[`k${i}`] = "v";
    const res = await patch({ patch: big });
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /200/);
  });
});

describe("GET /api/storage/:key", () => {
  it("存在则返回单键", async () => {
    await patch({ patch: { theme: "dark" } });
    const res = await app.inject(auth({ method: "GET", url: "/api/storage/theme" }));
    const body = JSON.parse(res.body);
    assert.equal(body.key, "theme");
    assert.equal(body.value, "dark");
    assert.ok(!Number.isNaN(Date.parse(body.updatedAt)), "单键也要带 updatedAt");
  });

  it("不存在 → 404", async () => {
    const res = await app.inject(auth({ method: "GET", url: "/api/storage/absent" }));
    assert.equal(res.statusCode, 404);
  });
});
