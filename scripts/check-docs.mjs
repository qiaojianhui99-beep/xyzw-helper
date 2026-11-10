#!/usr/bin/env node
/**
 * 文档与代码的一致性检查。
 *
 * 起因：项目文档里有大量「当前状态」陈述（命令、路径、脚本名、已删除模块），
 * 它们会随代码演进悄悄失效。2026-11 的一次巡检就发现：
 *   - BACKEND.md 说 `pnpm run verify` 跑 173 个单测（实际 243）
 *   - PROJECT-OVERVIEW.md 说「当前 30 个键」（实际 33）
 *   - AGENTS.md 说「主 chunk ≈ 4.7 MB」（早已分包，首屏 356 kB）
 *   - BACKEND.md 的脚本路径少了 `backend/` 前缀，读者会找错地方
 *
 * 这个脚本只检查**可以从代码验证的结构性事实**：
 *   1. 文中出现的 `npm run X` / `pnpm X` —— X 必须是 package.json 里真实存在的脚本
 *   2. 反引号里的仓库路径 —— 必须真实存在
 *   3. 已删除的模块 / 已不存在的 API 名 —— 不允许出现在「当前状态」语境里
 *
 * 检查范围限定在「当前状态」文档；历史记录（CHANGELOG、变更记录表、
 * 带日期的评审/验证文档、superpowers 计划）不参与，避免把历史事实当成错误。
 *
 * 用法：node scripts/check-docs.mjs
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([a-z]:)/i, "$1"));

/** 只检查这些「当前状态」文档 */
const DOCS = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/PROJECT-OVERVIEW.md",
  "docs/BACKEND.md",
  "docs/REGRESSION-CHECKLIST.md",
  "docs/DEPLOY.md",
  "docs/OPEN-CLOSED-RULES.md",
  "docs/feature-protocol-dev-guide.md",
];

/** package.json 之外的合法命令（npm 自带 / pnpm 内置） */
const NON_PROJECT_COMMANDS = new Set([
  "install", "add", "remove", "i", "exec", "dlx", "npx", "create",
  "workspace", "deploy", "publish", "link", "why", "outdated", "audit",
  "config", "store", "env",
]);

/**
 * 已删除的模块 / 已不存在的 API。命中即报告，除非同一行带了「历史/勘误」标记。
 */
const DEAD_IDS = {
  "src/stores/common.ts": "已于 2026-11-09 删除",
  "src/api/index.js": "已于 2026-11-09 删除",
  "src/utils/struckAnalyer.ts": "已于 2026-11-09 删除",
  "src/utils/testStudyQuestions.js": "已于 2026-11-09 删除",
  "src/utils/readable-xyzw-ws.js": "已于 2026-11-09 删除",
  "queuedTokens": "tokenStore 没有该属性（对外是 connectionQueue / batchSettings.maxActive）",
  "activeConnectionCount": "tokenStore 没有该属性",
  "getEstimatedWaitTime": "tokenStore 没有该方法",
  "connectWebSocket(": "对外方法是 createWebSocketConnection",
  "disconnectAllWebSockets": "对外方法是 closeWebSocketConnection",
  "maxActive = 10": "默认值是 2",
  "maxActive=10": "默认值是 2",
};

/** 同一行出现这些词，说明是在讲历史 / 勘误，不算冲突 */
const HISTORICAL_MARKERS = /(已删除|已移除|历史|勘误|弃用|不再|曾经|过去|旧版|为什么砍掉|不存在|已改为|已换成)/;

/** 占位符路径，跳过（Xxx / <page> / [[default]] 这类不是真实文件名） */
const PLACEHOLDER = /(Xxx|xxx|Name\.vue|<[^>]+>|…|\{|\}|\*|\(|\)|\[\[)/;

/** 同一行在讲「还没做」的事，路径本来就不该存在 */
const PENDING_MARKERS = /(需要补|待补|尚未|计划补|将补|TODO)/;

async function exists(p) {
  try {
    await stat(path.join(ROOT, p));
    return true;
  } catch {
    return false;
  }
}

const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const scripts = new Set(Object.keys(pkg.scripts));

const problems = [];

for (const file of DOCS) {
  let src;
  try {
    src = await readFile(path.join(ROOT, file), "utf8");
  } catch {
    problems.push({ file, line: 0, kind: "缺文件", text: "文档不存在" });
    continue;
  }

  const lines = src.split("\n");
  for (const [i, line] of lines.entries()) {
    const no = i + 1;

    // 变更记录表 / 历史段落整行跳过
    if (/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line.trim())) continue;

    // 1) 命令
    for (const m of line.matchAll(/\b(?:npm run|pnpm run|npm|pnpm)\s+([a-zA-Z][\w:-]*)/g)) {
      const name = m[1];
      if (NON_PROJECT_COMMANDS.has(name)) continue;
      if (!scripts.has(name)) {
        problems.push({ file, line: no, kind: "命令", text: `${m[0].trim()} —— package.json 无此脚本` });
      }
    }

    // 2) 路径（待办描述里的路径不算冲突）
    if (!PENDING_MARKERS.test(line))
    for (const m of line.matchAll(/`((?:src|docs|backend|scripts|test|deploy|public|render-backend|edge-functions|design-system)\/[^`\s]+)`/g)) {
      const raw = m[1].replace(/[，。；：、）)】]$/, "").replace(/:[\d-]+$/, "");
      if (PLACEHOLDER.test(raw)) continue;
      if (raw.endsWith("/")) {
        if (!(await exists(raw))) problems.push({ file, line: no, kind: "路径", text: `\`${raw}\` 目录不存在` });
        continue;
      }
      if (!(await exists(raw))) {
        problems.push({ file, line: no, kind: "路径", text: `\`${raw}\` 不存在` });
      }
    }

    // 3) 失效标识
    if (!HISTORICAL_MARKERS.test(line)) {
      for (const [dead, why] of Object.entries(DEAD_IDS)) {
        if (line.includes(dead)) {
          problems.push({ file, line: no, kind: "失效标识", text: `${dead} —— ${why}` });
        }
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`✅ 文档一致性检查通过（${DOCS.length} 份当前状态文档）`);
  process.exit(0);
}

console.error("❌ 文档与代码不一致：\n");
for (const p of problems) {
  console.error(`   ${p.file}:${p.line} [${p.kind}] ${p.text}`);
}
console.error(`\n共 ${problems.length} 处。修文档，或确认后从 DEAD_IDS / 检查范围里移除。`);
process.exit(1);
