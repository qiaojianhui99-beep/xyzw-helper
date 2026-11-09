/**
 * 抓取「功能基准快照」（characterization baseline）。
 *
 * 同一个脚本既可以打原版 Express，也可以打新版 Fastify：
 *   node backend/scripts/capture-baseline.mjs --base=http://127.0.0.1:3100 --out=backend/test/fixtures/baseline.original.json
 *
 * 用例、fixture、归一化逻辑全部来自 parity-core.mjs —— 抓取与对拍共用同一份定义。
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { runAll } from "./parity-core.mjs";

/** 同时支持 `--flag value` 与 `--flag=value` 两种写法。 */
function argValue(flag) {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const BASE = (argValue("--base") || "http://127.0.0.1:3100").replace(/\/$/, "");
const OUT = resolve(argValue("--out") || "backend/test/fixtures/baseline.json");

async function main() {
  const snapshot = await runAll({
    base: BASE,
    onProgress: (line) => console.log(line),
  });
  const withMeta = {
    base: BASE,
    capturedAt: new Date().toISOString(),
    ...snapshot,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(withMeta, null, 2)}\n`, "utf8");
  console.log(`\n快照写入 ${OUT}（${snapshot.caseCount} 条用例）`);
}

main().catch((err) => {
  console.error("抓取失败:", err);
  process.exitCode = 1;
});
