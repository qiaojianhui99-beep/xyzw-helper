/**
 * supabase-shim 一致性测试。
 *
 * 断言的是「原版 render-backend/server.js 依赖的 supabase 调用语义」，
 * 不是 shim 的实现细节。每条用例对应 server.js 里的一处真实调用形状。
 *
 * 运行前提：本地 Postgres 已启动
 *   pnpm --dir backend db:up
 *   node --test backend/test/supabaseShim.test.js
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient } from "../scripts/supabase-shim.js";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://xyzw:xyzw_dev_pw@127.0.0.1:55432/xyzw";

/** 测试数据统一前缀，避免污染手工数据 */
const TAG = `shimtest_${Date.now()}`;

let db;

before(async () => {
  db = createClient(DATABASE_URL);
  // 连通性检查：连不上就让整组失败，而不是逐条超时
  const { error } = await db.from("tokens").select("id").limit(1);
  assert.equal(error, null, `无法连接数据库：${error?.message}`);
});

after(async () => {
  await db.from("tokens").delete().eq("name", `${TAG}_plain`);
  await db.from("tokens").delete().eq("name", `${TAG}_camel`);
  await db.from("cron_tasks").delete().eq("name", `${TAG}_task`);
  await db.from("task_logs").delete().eq("token_name", `${TAG}_log`);
  await db.__end();
});

describe("supabase-shim", () => {
  describe("select", () => {
    it("server.js: supabase.from('tokens').select('*').eq('enabled', true)", async () => {
      const { data, error } = await db.from("tokens").select("*").eq("enabled", true);
      assert.equal(error, null);
      assert.ok(Array.isArray(data), "data 必须是数组");
    });

    it("server.js: supabase.from('tokens').select('*').order('created_at')", async () => {
      const { data, error } = await db.from("tokens").select("*").order("created_at");
      assert.equal(error, null);
      assert.ok(Array.isArray(data));
    });

    it("server.js: .select('*').eq('id', id).single() —— 有行时返回对象", async () => {
      const inserted = await db
        .from("cron_tasks")
        .insert({ name: `${TAG}_task`, cron_expr: "* * * * *", enabled: true })
        .select();
      const id = inserted.data[0].id;

      const { data, error } = await db.from("cron_tasks").select("*").eq("id", id).single();
      assert.equal(error, null);
      assert.equal(typeof data, "object");
      assert.equal(data.id, id);
      assert.equal(data.name, `${TAG}_task`);
    });

    it("single() 无行时返回 PGRST116 错误（原版据此判 404）", async () => {
      const { data, error } = await db
        .from("cron_tasks")
        .select("*")
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .single();
      assert.equal(data, null);
      assert.equal(error.code, "PGRST116");
    });
  });

  describe("camelCase 列名保真（server.js 的 tokenData 组装依赖）", () => {
    it("roleId / sessId / connId / isRestore 读出后保持原样", async () => {
      await db.from("tokens").insert({
        name: `${TAG}_camel`,
        token: "abc",
        roleId: "R123",
        sessId: "S456",
        connId: "C789",
        isRestore: true,
        enabled: true,
      });

      const { data } = await db.from("tokens").select("*").eq("name", `${TAG}_camel`);
      const row = data[0];
      assert.equal(row.roleId, "R123", "roleId 必须原样返回，不能被折叠成 roleid");
      assert.equal(row.sessId, "S456");
      assert.equal(row.connId, "C789");
      assert.equal(row.isRestore, true);
    });
  });

  describe("insert", () => {
    it("insert + select 返回插入行（原版 POST /api/tokens 的形状）", async () => {
      const { data, error } = await db
        .from("tokens")
        .insert({ name: `${TAG}_plain`, token: "xyz", enabled: true })
        .select();
      assert.equal(error, null);
      assert.ok(Array.isArray(data));
      assert.equal(data.length, 1);
      assert.equal(data[0].name, `${TAG}_plain`);
      assert.ok(data[0].id, "必须回填 uuid");
      assert.ok(data[0].created_at, "必须回填 created_at");
    });

    it("insert 不接 select 时 data 为 null（supabase 语义）", async () => {
      const { data, error } = await db.from("task_logs").insert({
        token_name: `${TAG}_log`,
        task_type: "signIn",
        status: "success",
      });
      assert.equal(error, null);
      assert.equal(data, null);
    });

    it("insert 违反非空约束时返回 error 而非抛出（原版 try/catch 依赖此行为）", async () => {
      const { data, error } = await db.from("tokens").insert({ token: "no-name" }).select();
      assert.equal(data, null);
      assert.ok(error, "必须返回 error 对象");
      assert.match(error.message, /null value|not-null/i);
    });
  });

  describe("update", () => {
    it("server.js: .update({last_run_at}).eq('id', id) 不接 select", async () => {
      const inserted = await db
        .from("cron_tasks")
        .insert({ name: `${TAG}_task2`, enabled: true })
        .select();
      const id = inserted.data[0].id;
      const stamp = new Date().toISOString();

      const { error } = await db.from("cron_tasks").update({ last_run_at: stamp }).eq("id", id);
      assert.equal(error, null);

      const { data } = await db.from("cron_tasks").select("last_run_at").eq("id", id).single();
      assert.equal(new Date(data.last_run_at).toISOString(), stamp);
    });

    it("update + select 返回更新后的行（原版 PATCH /api/tasks/:id）", async () => {
      const inserted = await db
        .from("cron_tasks")
        .insert({ name: `${TAG}_task3`, enabled: true })
        .select();
      const id = inserted.data[0].id;

      const { data, error } = await db
        .from("cron_tasks")
        .update({ enabled: false })
        .eq("id", id)
        .select();
      assert.equal(error, null);
      assert.equal(data[0].enabled, false);
    });
  });

  describe("delete", () => {
    it("server.js: .delete().eq('id', id)", async () => {
      const inserted = await db
        .from("tokens")
        .insert({ name: `${TAG}_del`, token: "t", enabled: true })
        .select();
      const id = inserted.data[0].id;

      const { error } = await db.from("tokens").delete().eq("id", id);
      assert.equal(error, null);

      const { data } = await db.from("tokens").select("id").eq("id", id);
      assert.equal(data.length, 0);
    });

    it("server.js: .delete().lt('created_at', iso)（日志清理任务）", async () => {
      const { error } = await db
        .from("task_logs")
        .delete()
        .lt("created_at", "1970-01-01T00:00:00.000Z");
      assert.equal(error, null);
    });
  });

  describe("limit / order（task_logs 分页）", () => {
    it("order desc + limit 返回不超过 limit 条且按时间倒序", async () => {
      for (let i = 0; i < 3; i++) {
        await db.from("task_logs").insert({
          token_name: `${TAG}_log`,
          task_type: `t${i}`,
          status: "success",
        });
      }
      const { data, error } = await db
        .from("task_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2);
      assert.equal(error, null);
      assert.ok(data.length <= 2);
      if (data.length === 2) {
        assert.ok(new Date(data[0].created_at) >= new Date(data[1].created_at));
      }
    });
  });

  describe("jsonb 列（cron_tasks.selected_tokens / selected_tasks）", () => {
    it("数组写入后原样读回为数组", async () => {
      const { data } = await db
        .from("cron_tasks")
        .insert({
          name: `${TAG}_jb`,
          selected_tokens: ["a", "b"],
          selected_tasks: ["signIn", "climbTower"],
          enabled: true,
        })
        .select();
      const id = data[0].id;
      const back = await db.from("cron_tasks").select("*").eq("id", id).single();
      assert.deepEqual(back.data.selected_tokens, ["a", "b"]);
      assert.deepEqual(back.data.selected_tasks, ["signIn", "climbTower"]);
      await db.from("cron_tasks").delete().eq("id", id);
    });
  });
});
