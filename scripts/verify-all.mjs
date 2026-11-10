#!/usr/bin/env node
/**
 * 本地一条命令等价 CI。
 *
 * 为什么需要：CI 在 GitHub 上跑，改动期间本地只有 `npm run verify`
 * （严格说它覆盖契约/lint/单测，但不含构建、产物预算与后端测试），
 * 于是「本地绿、CI 红」是常态。这个脚本把两边的步骤对齐到同一份清单。
 *
 *   node scripts/verify-all.mjs          # 全量（含构建与后端）
 *   node scripts/verify-all.mjs --fast   # 契约 + lint + 前端单测
 *
 * 后端测试需要 Postgres（`pnpm db:up`）。探测不到数据库时**跳过并显式标注**，
 * 不会假装通过 —— 跳过与通过必须能区分。
 */

import { spawnSync } from "node:child_process";
import net from "node:net";
import process from "node:process";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([a-z]:)/i, "$1");
const FAST = process.argv.includes("--fast");

/** @type {{ name: string, command: string, args?: string[], skip?: () => Promise<string | null>, optional?: boolean }[]} */
const steps = [];

/**
 * 探测本地 Postgres（默认 55432）。
 * @returns {Promise<string | null>} null = 可用；字符串 = 跳过原因
 */
function probePostgres() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 55432 });
    const done = (reason) => {
      socket.destroy();
      resolve(reason);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => done(null));
    socket.once("timeout", () => done("Postgres 55432 不可达（先跑 pnpm db:up）"));
    socket.once("error", () => done("Postgres 55432 不可达（先跑 pnpm db:up）"));
  });
}

steps.push({
  name: "架构契约（--strict）",
  command: "node",
  args: ["scripts/check-architecture.mjs", "--strict"],
});
steps.push({ name: "Lint（零警告，含 backend/）", command: "npm", args: ["run", "lint"] });
steps.push({ name: "类型检查（tsc --noEmit）", command: "npm", args: ["run", "typecheck"] });
steps.push({ name: "前端单测", command: "npm", args: ["test"] });

if (!FAST) {
  steps.push({ name: "生产构建", command: "npm", args: ["run", "build"] });
  steps.push({ name: "产物体积基线", command: "npm", args: ["run", "check:bundle"] });
  steps.push({ name: "文件规模预算", command: "npm", args: ["run", "check:size"] });
  steps.push({
    name: "后端单测",
    command: "npm",
    args: ["run", "test:backend"],
    skip: probePostgres,
  });
}

const results = [];

for (const step of steps) {
  const skipReason = step.skip ? await step.skip() : null;
  if (skipReason) {
    console.log(`\n⏭️  ${step.name} —— SKIP：${skipReason}`);
    results.push({ name: step.name, status: "skip", reason: skipReason });
    continue;
  }

  console.log(`\n▶️  ${step.name}`);
  const started = Date.now();
  const out = spawnSync(step.command, step.args ?? [], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  const ms = Date.now() - started;

  if (out.status === 0) {
    console.log(`✅ ${step.name}（${ms}ms）`);
    results.push({ name: step.name, status: "pass", ms });
  } else {
    console.log(`❌ ${step.name}（${ms}ms，退出码 ${out.status}）`);
    results.push({ name: step.name, status: "fail", ms, code: out.status });
  }
}

const failed = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skip");

console.log("\n──────── 汇总 ────────");
for (const r of results) {
  const icon = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⏭️";
  console.log(`${icon} ${r.name}`);
}
if (skipped.length > 0) {
  console.log(`\n⚠️  ${skipped.length} 项被跳过，结论不等于全绿：`);
  for (const r of skipped) console.log(`   - ${r.name}：${r.reason}`);
}

if (failed.length > 0) {
  console.log(`\n结论：FAIL（${failed.length} 项失败）`);
  process.exit(1);
}
if (skipped.length > 0) {
  console.log("\n结论：PASS（有跳过项，见上）");
  process.exit(0);
}
console.log("\n结论：PASS");
