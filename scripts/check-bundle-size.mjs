#!/usr/bin/env node
/**
 * 首屏体积预算检查。
 *
 * 只看「首次进入页面必须下载的东西」：dist/index.html 里的 entry 脚本、
 * 它的 modulepreload 依赖、以及同步样式表。路由懒加载 chunk 不计入。
 *
 * 用法：
 *   npm run build && npm run check:bundle
 *   npm run check:bundle -- --json     # 机器可读
 *
 * 预算（gzip 后）超标就退出码 1，方便塞进 CI。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const HTML = path.join(DIST, "index.html");

/** gzip 后预算，单位 byte */
const BUDGET = {
  js: 450 * 1024,
  css: 60 * 1024,
};

if (!fs.existsSync(HTML)) {
  console.error("❌ 找不到 dist/index.html，先跑 npm run build");
  process.exit(1);
}

const html = fs.readFileSync(HTML, "utf8");
const assets = new Set();

for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(m[1]);
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
  const tag = m[0];
  if (!/rel="(?:modulepreload|stylesheet|preload)"/.test(tag)) continue;
  assets.add(m[1]);
}

const rows = [];
for (const href of assets) {
  if (!href.startsWith("/")) continue; // 外链（CDN / 字体）不计
  const file = path.join(DIST, href.replace(/^\//, ""));
  if (!fs.existsSync(file)) continue;
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).replace(".", "") || "other";
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  rows.push({ href, ext, raw: buf.length, gz });
}

const sum = (list) => list.reduce((acc, row) => acc + row.gz, 0);
const js = rows.filter((r) => r.ext === "js" || r.ext === "mjs");
const css = rows.filter((r) => r.ext === "css");

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        js: sum(js),
        css: sum(css),
        budget: BUDGET,
        assets: rows.map((r) => ({ ...r, gz: r.gz })),
      },
      null,
      2,
    ),
  );
} else {
  console.log("\n首屏资源（gzip 后）：");
  for (const row of rows.sort((a, b) => b.gz - a.gz)) {
    console.log(`  ${kb(row.gz).padStart(10)}  ${row.href}`);
  }
  console.log(`\n  JS 合计  ${kb(sum(js))} / 预算 ${kb(BUDGET.js)}`);
  console.log(`  CSS 合计 ${kb(sum(css))} / 预算 ${kb(BUDGET.css)}\n`);
}

const over = [];
if (sum(js) > BUDGET.js) over.push(`JS ${kb(sum(js))} > ${kb(BUDGET.js)}`);
if (sum(css) > BUDGET.css) over.push(`CSS ${kb(sum(css))} > ${kb(BUDGET.css)}`);

if (over.length > 0) {
  console.error(`❌ 首屏体积超预算：${over.join("；")}`);
  process.exit(1);
}
if (!process.argv.includes("--json")) console.log("✅ 首屏体积在预算内\n");
