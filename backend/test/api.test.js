/**
 * Fastify API 进程内测试（app.inject，无需起端口）。
 *
 * 与 parity.test.js 的分工：
 *   parity.test.js  —— 证明「与改造前逐字节一致」（需要外部服务 + 基准快照）
 *   本文件          —— 证明「每条路由自身行为正确」，含边界与错误路径，可在 CI 直接跑
 *
 * 前提：本地 Postgres 已启动（pnpm --dir backend db:up）。
 */

import assert from "node:assert/strict";
import process from "node:process";
import { after, before, beforeEach, describe, it } from "node:test";
import { buildApp } from "../src/api/app.js";
import { closePool, pool } from "../src/infra/db.js";
import { clearLogs } from "../src/infra/logger.js";
import { stopAllCrons } from "../src/worker/scheduler.js";

const API_KEY = process.env.API_KEY || "dev-api-key";

/** @type {import("fastify").FastifyInstance} */
let app;

before(async () => {
  app = await buildApp();
  await app.ready();
});

after(async () => {
  stopAllCrons();
  await app.close();
  await closePool();
});

beforeEach(async () => {
  clearLogs();
  stopAllCrons();
  await pool.query("TRUNCATE tokens, cron_tasks, task_logs RESTART IDENTITY CASCADE");
});

/** 带鉴权的请求。 */
function auth(opts = {}) {
  return { ...opts, headers: { "x-api-key": API_KEY, ...(opts.headers ?? {}) } };
}

async function seedToken(overrides = {}) {
  const res = await app.inject(auth({
    method: "POST",
    url: "/api/tokens",
    payload: { name: "alpha", token: "tok-alpha", roleId: "R1", ...overrides },
  }));
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body)[0];
}

async function seedTask(overrides = {}) {
  const res = await app.inject(auth({
    method: "POST",
    url: "/api/tasks",
    payload: { name: "nightly", cron_expr: "0 3 * * *", selected_tasks: ["signIn"], enabled: true, ...overrides },
  }));
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body)[0];
}

describe("鉴权", () => {
  it("/health 免鉴权", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, "ok");
    assert.equal(typeof body.activeCrons, "number");
    assert.equal(typeof body.logsInMemory, "number");
  });

  it("/api/* 无 key → 401 { error: 'Unauthorized' }", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tokens" });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(JSON.parse(res.body), { error: "Unauthorized" });
  });

  it("错误 key → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tokens", headers: { "x-api-key": "wrong" } });
    assert.equal(res.statusCode, 401);
  });

  it("Authorization: Bearer <key> 同样接受（与原版一致）", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    assert.equal(res.statusCode, 200);
  });
});

describe("GET /api/tokens", () => {
  it("按 created_at 升序返回数组", async () => {
    await seedToken({ name: "first" });
    await new Promise((r) => setTimeout(r, 10));
    await seedToken({ name: "second" });

    const res = await app.inject(auth({ method: "GET", url: "/api/tokens" }));
    assert.equal(res.statusCode, 200);
    const rows = JSON.parse(res.body);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.name), ["first", "second"]);
  });

  it("camelCase 列原样返回（roleId/sessId/connId/isRestore）", async () => {
    await seedToken({ roleId: "R9", sessId: "S9", connId: "C9", isRestore: true });
    const res = await app.inject(auth({ method: "GET", url: "/api/tokens" }));
    const row = JSON.parse(res.body)[0];
    assert.equal(row.roleId, "R9");
    assert.equal(row.sessId, "S9");
    assert.equal(row.connId, "C9");
    assert.equal(row.isRestore, true);
  });
});

describe("POST /api/tokens", () => {
  it("返回数组（原版是 200 不是 201）", async () => {
    const res = await app.inject(auth({
      method: "POST",
      url: "/api/tokens",
      payload: { name: "gamma", token: "tok-gamma" },
    }));
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body));
    assert.equal(body[0].name, "gamma");
    assert.ok(body[0].id, "必须回填 uuid");
    assert.ok(body[0].created_at, "必须回填 created_at");
  });

  it("未知字段被丢弃，不写库", async () => {
    const res = await app.inject(auth({
      method: "POST",
      url: "/api/tokens",
      payload: { name: "d", token: "t", notAColumn: "x" },
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body)[0].notAColumn, undefined);
  });

  it("缺 name/token → 400 { error }", async () => {
    const res = await app.inject(auth({ method: "POST", url: "/api/tokens", payload: { token: "t" } }));
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error);
  });
});

describe("DELETE /api/tokens/:id", () => {
  it("删除成功 → { ok: true }", async () => {
    const t = await seedToken();
    const res = await app.inject(auth({ method: "DELETE", url: `/api/tokens/${t.id}` }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });

    const list = await app.inject(auth({ method: "GET", url: "/api/tokens" }));
    assert.equal(JSON.parse(list.body).length, 0);
  });

  it("非法 uuid → 400（不 500）", async () => {
    const res = await app.inject(auth({ method: "DELETE", url: "/api/tokens/not-a-uuid" }));
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error);
  });
});

describe("定时任务 CRUD", () => {
  it("POST 返回数组并注册 cron（activeCrons +1）", async () => {
    await seedTask();
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(JSON.parse(health.body).activeCrons, 1);
  });

  it("jsonb 字段往返保持数组", async () => {
    const task = await seedTask({ selected_tokens: ["a", "b"], selected_tasks: ["signIn", "climbTower"] });
    assert.deepEqual(task.selected_tokens, ["a", "b"]);
    assert.deepEqual(task.selected_tasks, ["signIn", "climbTower"]);
  });

  it("PATCH 返回数组且字段已更新", async () => {
    const task = await seedTask();
    const res = await app.inject(auth({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { enabled: false },
    }));
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body));
    assert.equal(body[0].enabled, false);
  });

  it("DELETE → { ok: true }，activeCrons 归零", async () => {
    const task = await seedTask();
    const res = await app.inject(auth({ method: "DELETE", url: `/api/tasks/${task.id}` }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(JSON.parse(health.body).activeCrons, 0);
  });

  it("POST /:id/run 存在 → 200 { status: 'running', task: name }", async () => {
    const task = await seedTask();
    const res = await app.inject(auth({ method: "POST", url: `/api/tasks/${task.id}/run` }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { status: "running", task: "nightly" });
  });

  it("POST /:id/run 不存在 → 404 { error: '任务不存在' }", async () => {
    const res = await app.inject(auth({ method: "POST", url: "/api/tasks/does-not-exist/run" }));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: "任务不存在" });
  });
});

describe("日志与字典", () => {
  it("GET /api/logs 遵守 limit 与上限", async () => {
    const res = await app.inject(auth({ method: "GET", url: "/api/logs?limit=3" }));
    assert.equal(res.statusCode, 200);
    const rows = JSON.parse(res.body);
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length <= 3);
  });

  it("GET /api/logs/db 返回插入的日志行", async () => {
    await pool.query(
      `INSERT INTO task_logs (token_name, task_type, status, message) VALUES ('alpha', 'signIn', 'success', NULL)`,
    );
    const res = await app.inject(auth({ method: "GET", url: "/api/logs/db?limit=5" }));
    assert.equal(res.statusCode, 200);
    const rows = JSON.parse(res.body);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token_name, "alpha");
    assert.equal(typeof rows[0].id, "number", "int8 必须是 number，与 supabase 一致");
  });

  it("GET /api/task-definitions 返回 17 个任务且形状正确", async () => {
    const res = await app.inject(auth({ method: "GET", url: "/api/task-definitions" }));
    assert.equal(res.statusCode, 200);
    const list = JSON.parse(res.body);
    assert.equal(list.length, 17);
    const signIn = list.find((x) => x.key === "signIn");
    assert.deepEqual(signIn, { key: "signIn", name: "签到", commands: ["system_signinreward"] });
  });
});

describe("未定义路由", () => {
  it("404 返回 JSON 而非 HTML", async () => {
    const res = await app.inject(auth({ method: "GET", url: "/api/nope" }));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: "Not Found" });
  });
});
