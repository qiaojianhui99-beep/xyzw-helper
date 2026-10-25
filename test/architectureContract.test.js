import assert from "node:assert/strict";
import test from "node:test";

import {
  checkArchitecture,
  collectFacts,
  compare,
} from "../scripts/check-architecture.mjs";

/**
 * 架构契约回归测试
 *
 * 这里守护的是「既有能力不许被悄悄拿走」：
 *   1) 真实工程必须完全满足 architecture.contract.json
 *   2) 抽取器本身必须真的抽到了东西（防止空对象导致的假通过）
 *   3) 比对器必须真的能报错（防止写着写着变成永远通过）
 */

test("工程满足架构契约基线", async () => {
  const result = await checkArchitecture();
  assert.deepEqual(
    result.violations,
    [],
    `以下既有能力被删除或改变：\n${result.violations.join("\n")}`,
  );
});

test("契约抽取器抽到了真实内容（防止空基线假通过）", async () => {
  const facts = await collectFacts();

  assert.ok(facts.routes.length >= 15, `路由只有 ${facts.routes.length} 条`);
  assert.ok(facts.routeNames.length >= 12, `路由名只有 ${facts.routeNames.length} 个`);
  assert.ok(facts.views.length >= 20, `页面只有 ${facts.views.length} 个`);
  assert.ok(facts.batchTasks.length >= 10, `批量任务模块只有 ${facts.batchTasks.length} 个`);
  assert.ok(facts.storageKeys.length >= 25, `存储键只有 ${facts.storageKeys.length} 个`);
  assert.ok(facts.proxyPrefixes.length >= 4, `代理前缀只有 ${facts.proxyPrefixes.length} 个`);
  assert.equal(facts.requiresTokenRoutes >= 10, true, "受保护路由数量异常");

  const bonExports = facts.modules["src/utils/bonProtocol.js"] ?? [];
  for (const name of ["ProtoMsg", "GameMessages", "bonProtocol", "DataReader", "DataWriter"]) {
    assert.ok(bonExports.includes(name), `bonProtocol 缺少导出：${name}`);
  }

  const wsExports = facts.modules["src/utils/xyzwWebSocket.js"] ?? [];
  for (const name of ["XyzwWebSocketClient", "CommandRegistry", "registerDefaultCommands"]) {
    assert.ok(wsExports.includes(name), `xyzwWebSocket 缺少导出：${name}`);
  }

  assert.equal(facts.defaults.maxActive, 2, "批量并发默认值应为 2");
  assert.equal(facts.defaults.connectionTimeout, 10000, "连接超时默认值应为 10000");
});

test("比对器能识别删除路由、删除导出、改动默认参数", () => {
  const contract = {
    routes: ["/", "/tokens", "/admin"],
    routeNames: ["Home"],
    views: ["src/views/Home.vue"],
    batchTasks: ["src/utils/batch/tasksStore.js"],
    storageKeys: ["gameTokens"],
    proxyPrefixes: ["/api/hortor"],
    scripts: ["dev"],
    dependencies: { vue: "1.0.0" },
    defaults: { maxActive: 2 },
    requiresTokenRoutes: 2,
    files: ["index.html"],
    modules: { "src/utils/bonProtocol.js": ["ProtoMsg", "GameMessages"] },
  };

  const facts = {
    routes: ["/", "/tokens"],
    routeNames: ["Home"],
    views: ["src/views/Home.vue"],
    batchTasks: ["src/utils/batch/tasksStore.js"],
    storageKeys: ["gameTokens"],
    proxyPrefixes: ["/api/hortor"],
    scripts: ["dev"],
    dependencies: { vue: "1.0.0" },
    defaults: { maxActive: 3 },
    requiresTokenRoutes: 1,
    files: { "index.html": true },
    modules: { "src/utils/bonProtocol.js": ["ProtoMsg"] },
  };

  const { violations } = compare(contract, facts);
  const joined = violations.join("\n");

  assert.match(joined, /路由 path丢失：\/admin/);
  assert.match(joined, /导出被删除：src\/utils\/bonProtocol\.js -> GameMessages/);
  assert.match(joined, /默认参数被改动：maxActive/);
  assert.match(joined, /受保护路由变少/);
});

test("比对器允许纯新增（开闭原则：只加不减）", () => {
  const contract = {
    routes: ["/"],
    routeNames: ["Home"],
    views: [],
    batchTasks: [],
    storageKeys: [],
    proxyPrefixes: [],
    scripts: ["dev"],
    dependencies: {},
    defaults: {},
    requiresTokenRoutes: 0,
    files: {},
    modules: {},
  };

  const facts = {
    routes: ["/", "/new-feature"],
    routeNames: ["Home", "NewFeature"],
    views: ["src/views/NewFeature.vue"],
    batchTasks: [],
    storageKeys: ["newFeatureDraft"],
    proxyPrefixes: [],
    scripts: ["dev", "verify"],
    dependencies: { "some-lib": "1.0.0" },
    defaults: {},
    requiresTokenRoutes: 0,
    files: {},
    modules: {},
  };

  const { violations, additions } = compare(contract, facts);
  assert.deepEqual(violations, []);
  assert.ok(additions.length >= 4, "新增项应被记录为 additions");
});
