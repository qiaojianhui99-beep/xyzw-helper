/**
 * 任务执行编排测试。
 *
 * 用注入的 fake 客户端验证编排逻辑，不连真实游戏服：
 *   - 选中 token 为空 / 任务类型为空 / 未知任务类型 的处理
 *   - 命令展开与去重
 *   - 每个 Token 单独建连、执行、断开
 *   - 成功/失败逐条落 task_logs
 *   - 结束后更新 last_run_at
 *   - 并发闸不超过配置值
 *
 * 真实 BON 协议的正确性由 src/protocol 下的既有测试与前端 test/bonProtocol.test.js 覆盖。
 */

import assert from "node:assert/strict";
import process from "node:process";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { seal } from "../src/infra/crypto.js";
import { closePool, many, pool } from "../src/infra/db.js";
import { executeTask, resetClientFactory, setClientFactory } from "../src/worker/runner.js";

/** 记录所有被创建过的 fake 客户端，便于断言。 */
let created = [];
/** 每个 fake 的行为开关。 */
let behavior = { connectFail: false, roleInfoFail: false, failCmds: [] };

/** 一个最小 GameClient 替身，形状与真实客户端一致。 */
function makeFakeClient(tokenData) {
  const fake = {
    tokenData,
    connected: false,
    sent: [],
    disconnected: false,
    async connect() {
      if (behavior.connectFail) throw new Error("连接失败（测试注入）");
      this.connected = true;
    },
    async sendWithPromise(cmd) {
      if (cmd === "role_getroleinfo" && behavior.roleInfoFail) {
        throw new Error("获取角色信息失败（测试注入）");
      }
      return { ok: true, cmd };
    },
    async executeBatch(commands) {
      return commands.map((c) => ({
        cmd: c.cmd,
        success: !behavior.failCmds.includes(c.cmd),
        error: behavior.failCmds.includes(c.cmd) ? "命令失败（测试注入）" : undefined,
      }));
    },
    disconnect() {
      this.disconnected = true;
      this.connected = false;
    },
  };
  created.push(fake);
  return fake;
}

async function insertToken(overrides = {}) {
  const plain = overrides.token ?? "plain-token-value";
  const { rows } = await pool.query(
    `INSERT INTO tokens (name, token, token_enc, token_masked, "roleId", "sessId", "connId", "isRestore", enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      overrides.name ?? "alpha",
      plain,
      JSON.stringify(seal(plain)),
      "****",
      overrides.roleId ?? "R1",
      overrides.sessId ?? "S1",
      overrides.connId ?? "C1",
      overrides.isRestore ?? false,
      overrides.enabled ?? true,
    ],
  );
  return rows[0];
}

async function insertTask(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO cron_tasks (name, cron_expr, selected_tokens, selected_tasks, enabled)
     VALUES ($1, $2, $3, $4, true) RETURNING *`,
    [
      overrides.name ?? "nightly",
      overrides.cron_expr ?? "0 3 * * *",
      JSON.stringify(overrides.selected_tokens ?? []),
      JSON.stringify(overrides.selected_tasks ?? ["signIn"]),
    ],
  );
  return rows[0];
}

before(async () => {
  process.env.TOKEN_MASTER_KEY ||= Buffer.alloc(32, 9).toString("base64");
  process.env.TOKEN_KEY_ID ||= "test-k1";
  setClientFactory(makeFakeClient);
});

after(async () => {
  resetClientFactory();
  await closePool();
});

beforeEach(async () => {
  created = [];
  behavior = { connectFail: false, roleInfoFail: false, failCmds: [] };
  await pool.query("TRUNCATE tokens, cron_tasks, task_logs RESTART IDENTITY CASCADE");
});

afterEach(() => {
  resetClientFactory();
  setClientFactory(makeFakeClient);
});

describe("executeTask 参数校验", () => {
  it("没有选中 token → 跳过并记录 skipped 日志", async () => {
    const task = await insertTask({ selected_tokens: [] });
    const r = await executeTask(task);
    assert.equal(r.tokens, 0);
    assert.deepEqual(r.skipped, ["no-tokens"]);

    const logs = await many("SELECT * FROM task_logs");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, "skipped");
  });

  it("没有任务类型 → 记录 error 日志且不建连", async () => {
    const t = await insertToken();
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: [] });
    const r = await executeTask(task);
    assert.deepEqual(r.skipped, ["no-task-keys"]);
    assert.equal(created.length, 0, "不应创建任何客户端");
  });

  it("未知任务类型 → 跳过该 key 但继续处理已知的", async () => {
    const t = await insertToken();
    const task = await insertTask({
      selected_tokens: [t.id],
      selected_tasks: ["signIn", "notARealTask"],
    });
    const r = await executeTask(task);
    assert.deepEqual(r.skipped, ["notARealTask"]);
    assert.equal(created.length, 1);
  });

  it("没有匹配的 token → skipped", async () => {
    const task = await insertTask({
      selected_tokens: ["00000000-0000-0000-0000-000000000000"],
      selected_tasks: ["signIn"],
    });
    const r = await executeTask(task);
    assert.deepEqual(r.skipped, ["tokens-not-found"]);
  });
});

describe("executeTask 执行", () => {
  it("正常执行：建连 → 执行 → 断开，结果写 task_logs", async () => {
    const t = await insertToken();
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: ["signIn"] });
    const r = await executeTask(task);

    assert.equal(r.tokens, 1);
    assert.equal(r.ok, 1);
    assert.equal(r.failed, 0);
    assert.equal(created.length, 1);
    assert.equal(created[0].disconnected, true, "必须断开连接");

    const logs = await many("SELECT * FROM task_logs ORDER BY id");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].token_name, "alpha");
    assert.equal(logs[0].task_type, "system_signinreward");
    assert.equal(logs[0].status, "success");
  });

  it("dailyBundle 展开成 8 条去重命令（与原版一致）", async () => {
    const t = await insertToken();
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: ["dailyBundle"] });
    await executeTask(task);

    const logs = await many("SELECT * FROM task_logs ORDER BY id");
    assert.equal(logs.length, 8);
    const cmds = logs.map((l) => l.task_type);
    assert.equal(new Set(cmds).size, 8, "命令不应重复");
    assert.ok(cmds.includes("system_signinreward"));
    assert.ok(cmds.includes("legacy_claimhangup"));
  });

  it("多任务类型重叠命令只执行一次", async () => {
    const t = await insertToken();
    // signIn 与 dailyBundle 都含 system_signinreward
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: ["signIn", "dailyBundle"] });
    await executeTask(task);

    const logs = await many("SELECT * FROM task_logs");
    const signInCount = logs.filter((l) => l.task_type === "system_signinreward").length;
    assert.equal(signInCount, 1, "system_signinreward 只应出现一次");
  });

  it("连接失败 → 记 error 日志，断开仍被调用", async () => {
    behavior.connectFail = true;
    const t = await insertToken();
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: ["signIn"] });
    const r = await executeTask(task);

    assert.equal(r.failed, 1);
    const logs = await many("SELECT * FROM task_logs");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, "error");
    assert.match(logs[0].message, /连接失败/);
  });

  it("角色信息失败不阻断任务（与原版一致）", async () => {
    behavior.roleInfoFail = true;
    const t = await insertToken();
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: ["signIn"] });
    const r = await executeTask(task);
    assert.equal(r.ok, 1, "仍应执行命令");
  });

  it("单条命令失败 → 该条 error、其余 success", async () => {
    behavior.failCmds = ["tower_claimreward"];
    const t = await insertToken();
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: ["climbTower"] });
    const r = await executeTask(task);

    assert.equal(r.ok, 1);
    assert.equal(r.failed, 1);

    const logs = await many("SELECT * FROM task_logs ORDER BY id");
    assert.equal(logs.filter((l) => l.status === "success").length, 1);
    assert.equal(logs.filter((l) => l.status === "error").length, 1);
  });

  it("结束后更新 cron_tasks.last_run_at", async () => {
    const t = await insertToken();
    const task = await insertTask({ selected_tokens: [t.id], selected_tasks: ["signIn"] });
    const before = await pool.query("SELECT last_run_at FROM cron_tasks WHERE id = $1", [task.id]);
    assert.equal(before.rows[0].last_run_at, null);

    await executeTask(task);

    const after = await pool.query("SELECT last_run_at FROM cron_tasks WHERE id = $1", [task.id]);
    assert.notEqual(after.rows[0].last_run_at, null);
  });

  it("旧字段兼容：token_ids / task_type 也能驱动执行", async () => {
    const t = await insertToken();
    // 关键：旧数据的 selected_tokens / selected_tasks 列是 NULL（不是默认空数组），
    // 只有 NULL 才会回落到 token_ids / task_type —— 与原版的 `||` 语义一致。
    const { rows } = await pool.query(
      `INSERT INTO cron_tasks (name, cron_expression, token_ids, selected_tokens, selected_tasks, task_type, enabled)
       VALUES ('legacy', '0 3 * * *', $1, NULL, NULL, 'signIn', true) RETURNING *`,
      [JSON.stringify([t.id])],
    );
    const r = await executeTask(rows[0]);
    assert.equal(r.ok, 1, "旧字段路径也应正常执行");
  });

  it("并发闸：3 个 token 且上限 2 时分批建连", async () => {
    const tokens = [];
    for (const name of ["a", "b", "c"]) tokens.push(await insertToken({ name }));
    const task = await insertTask({
      selected_tokens: tokens.map((t) => t.id),
      selected_tasks: ["signIn"],
    });

    let peak = 0;
    let active = 0;
    setClientFactory((tokenData) => {
      const base = makeFakeClient(tokenData);
      const origConnect = base.connect.bind(base);
      base.connect = async () => {
        active += 1;
        peak = Math.max(peak, active);
        await origConnect();
      };
      const origDisconnect = base.disconnect.bind(base);
      base.disconnect = () => {
        active -= 1;
        origDisconnect();
      };
      return base;
    });

    const r = await executeTask(task);
    assert.equal(r.tokens, 3);
    assert.ok(peak <= 2, `并发峰值 ${peak} 不应超过 2`);
  });
});
