#!/usr/bin/env node
/**
 * 页面结构指纹回归。
 *
 * 为什么需要：`views/BatchDailyTasks.vue` 有 6000+ 行，template 与 script 深度交织。
 * 拆分它时，类型检查与单测都看不到「渲染结果变了」——有一个真实案例：
 * 把排序逻辑抽成 composable 后 `tsc` 与 lint 全绿，但页面白屏，因为 Pinia 会把
 * store 里的 ref 解包成数组，`tokens.value` 变成 undefined。
 *
 * 这个脚本用真实浏览器渲染页面，提取**归一化后的结构指纹**
 * （可见文本 + 按钮清单 + 表单/卡片数量），与基线比对。
 * 比像素截图稳：不受字体、分辨率、时间戳影响。
 *
 * 用法（需要 playwright，未安装时脚本会提示并跳过，不阻塞 CI）：
 *   npm run dev                 # 另开一个终端
 *   node scripts/ui-fingerprint.mjs            # 对比基线
 *   node scripts/ui-fingerprint.mjs --update   # 生成/更新基线（确认改动是有意的）
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([a-z]:)/i, "$1"));
const BASE = path.join(ROOT, "test/ui/baseline");
const ORIGIN = process.env.UI_ORIGIN ?? "http://127.0.0.1:3000";
const UPDATE = process.argv.includes("--update");

/** 需要盯的页面（不进 /admin 的登录墙用 fixture 绕过） */
const PAGES = [
  { slug: "admin-batch-daily-tasks", route: "/admin/batch-daily-tasks", root: ".batch-daily-tasks" },
  { slug: "admin-daily-tasks", route: "/admin/daily-tasks", root: null },
  { slug: "admin-dashboard", route: "/admin/dashboard", root: null },
  { slug: "tokens", route: "/tokens", root: null },
];

/** 本地存储 fixture：一个假 token，足以通过 requiresToken 守卫 */
const FIXTURE = {
  tokens: [
    {
      id: "visual-regression",
      name: "视觉回归账号",
      token: "AAAA",
      wsUrl: null,
      server: "s1",
      remark: "ui fixture",
      importMethod: "manual",
      level: 1,
      profession: "warrior",
    },
  ],
  selectedTokenId: "visual-regression",
};

/**
 * 归一化文本：抹掉必然变化的部分（时间、ISO 时间戳、日志计数）。
 * @param s 原始文本
 * @returns 归一化后的文本
 */
function normalize(s) {
  return s
    .replace(/\d{2}:\d{2}:\d{2}/g, "<time>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<iso>")
    .replace(/\d+\/\d{4}/g, "<log-count>")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("⏭️  未安装 playwright，跳过 UI 指纹检查");
    console.log("   需要时执行：pnpm add -D playwright && npx playwright install chromium");
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 注入 fixture（先访问一次同源页面，才能写 localStorage）
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((fixture) => {
    localStorage.setItem("gameTokens", JSON.stringify(fixture.tokens));
    localStorage.setItem("selectedTokenId", fixture.selectedTokenId);
  }, FIXTURE);

  await mkdir(BASE, { recursive: true });
  const failures = [];

  for (const target of PAGES) {
    await page.goto(`${ORIGIN}${target.route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const fingerprint = await page.evaluate((rootSel) => {
      const root = (rootSel && document.querySelector(rootSel)) || document.body;
      const norm = (s) => s
        .replace(/\d{2}:\d{2}:\d{2}/g, "<time>")
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<iso>")
        .replace(/\d+\/\d{4}/g, "<log-count>")
        .replace(/\s+/g, " ")
        .trim();
      return {
        route: location.pathname,
        title: document.title,
        text: norm(root.innerText || ""),
        buttons: [...root.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter(Boolean),
        inputs: root.querySelectorAll("input,textarea,select").length,
        cards: root.querySelectorAll(".n-card, .arco-card").length,
      };
    }, target.root);

    const file = path.join(BASE, `${target.slug}.json`);
    if (UPDATE) {
      await writeFile(file, `${JSON.stringify(fingerprint, null, 2)}\n`, "utf8");
      console.log(`✅ 已写入基线 ${path.relative(ROOT, file)}（${fingerprint.text.length} 字符）`);
      continue;
    }

    let baseline;
    try {
      baseline = JSON.parse(await readFile(file, "utf8"));
    } catch {
      console.log(`⏭️  没有基线：${target.slug}（先跑 --update）`);
      continue;
    }

    const diffs = [];
    if (fingerprint.title !== baseline.title) diffs.push(`标题：${baseline.title} → ${fingerprint.title}`);
    if (fingerprint.text !== baseline.text) {
      let i = 0;
      while (i < fingerprint.text.length && fingerprint.text[i] === baseline.text[i]) i++;
      diffs.push(`文本第 ${i} 字起不同：…${fingerprint.text.slice(Math.max(0, i - 20), i + 40)}`);
    }
    if (fingerprint.buttons.length !== baseline.buttons.length) {
      diffs.push(`按钮数：${baseline.buttons.length} → ${fingerprint.buttons.length}`);
    } else if (JSON.stringify(fingerprint.buttons) !== JSON.stringify(baseline.buttons)) {
      diffs.push("按钮清单变化");
    }
    if (fingerprint.inputs !== baseline.inputs) diffs.push(`表单数：${baseline.inputs} → ${fingerprint.inputs}`);
    if (fingerprint.cards !== baseline.cards) diffs.push(`卡片数：${baseline.cards} → ${fingerprint.cards}`);

    if (diffs.length > 0) {
      failures.push({ slug: target.slug, diffs });
      console.error(`❌ ${target.slug}`);
      for (const d of diffs) console.error(`   - ${d}`);
    } else {
      console.log(`✅ ${target.slug} 与基线一致`);
    }
  }

  await browser.close();

  if (failures.length > 0) {
    console.error("\n若改动是有意的，跑 `node scripts/ui-fingerprint.mjs --update` 更新基线后再提交。");
    process.exit(1);
  }
  console.log("\n结论：PASS");
}

await main();
