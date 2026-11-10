#!/usr/bin/env node
/**
 * 文件规模预算。
 *
 * 为什么需要：`BatchDailyTasks.vue` 已经 6000+ 行，`ClubWarrankV2.vue` 5000+ 行，
 * 没有任何机制阻止它们继续变胖 —— 这类文件的痛点是「改一处要读一整天上下文」。
 *
 * 策略（渐进收紧，不要求一次重构）：
 *   - 已超标的文件登记明确上限，**不许再增长**
 *   - 其它文件统一上限 3000 行
 *   - 纯数据表（名字表等）单独登记额度
 *
 * 拆分了某个大文件时，顺手把这里的上限调低，额度只减不增。
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([a-z]:)/i, "$1"));
const EXT = new Set([".js", ".ts", ".vue"]);
const SKIP = ["node_modules", "dist", ".git"];

/**
 * 单文件上限（2026-11-10 实测值 + 极小缓冲）。
 * 这些是历史存量，**只许降不许升**；拆分后请顺手把数字调低。
 */
const FILE_LIMITS = {
  "src/views/boss_names.js": 10100, // 纯数据表：Boss 名称
  "src/views/BatchDailyTasks.vue": 6700,
  "src/components/Club/ClubWarrankV2.vue": 5700,
  "src/components/Club/CampChallenge.vue": 4800,
  "src/components/Club/ClubWarrank.vue": 3900,
  "src/components/cards/Unlimitedlineup.vue": 3500,
  "src/components/Club/PeachInfoV2.vue": 3500,
  "src/components/cards/GoldRankListPageCard.vue": 3350,
  "src/components/Club/GreatRouteRankListPageCard.vue": 3300,
  "src/components/cards/TopClubListPageCard.vue": 3150,
};

/** 未登记文件的默认上限 */
const DEFAULT_LIMIT = 3000;
/** src 总行数上限（不含第三方 src/xyzw） */
const TOTAL_LIMIT = 136000;

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.includes(e.name) || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (full.endsWith(path.join("src", "xyzw"))) continue;
      await walk(full, out);
    } else if (EXT.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

const files = await walk(path.join(ROOT, "src"));
const rows = [];
for (const full of files) {
  const rel = path.relative(ROOT, full).replaceAll("\\", "/");
  const text = await readFile(full, "utf8");
  // 与 PowerShell 的 Measure-Object -Line 口径一致：统计换行符
  const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  rows.push({ rel, lines });
}

const over = [];
for (const { rel, lines } of rows) {
  const limit = FILE_LIMITS[rel] ?? DEFAULT_LIMIT;
  if (lines > limit) over.push({ rel, lines, limit });
}

const total = rows.reduce((sum, r) => sum + r.lines, 0);

const top = rows.sort((a, b) => b.lines - a.lines).slice(0, 5);
console.log("最大的 5 个文件：");
for (const t of top) console.log(`  ${String(t.lines).padStart(6)} 行  ${t.rel}`);
console.log(`\n合计 ${rows.length} 个文件 / ${total} 行（预算 ${TOTAL_LIMIT}）`);

let failed = false;
if (over.length > 0) {
  failed = true;
  console.error("\n❌ 以下文件超出规模预算（拆小或下调预算后再提交）：");
  for (const o of over) console.error(`   - ${o.rel}: ${o.lines} > ${o.limit}`);
}
if (total > TOTAL_LIMIT) {
  failed = true;
  console.error(`\n❌ src 总行数 ${total} 超过预算 ${TOTAL_LIMIT}`);
}

if (failed) process.exit(1);
console.log("✅ 文件规模在预算内");
