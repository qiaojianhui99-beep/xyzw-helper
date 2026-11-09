/**
 * 功能对拍测试（parity / characterization test）。
 *
 * 断言：被测服务的 HTTP 行为与「改造前的原版 Express」逐条一致。
 *
 * 运行方式（目标服务必须先启动，且连同一个 DATABASE_URL）：
 *   PARITY_BASE=http://127.0.0.1:3200 node --test backend/test/parity.test.js
 *
 * 未设置 PARITY_BASE 时整组 skip —— 保证 `pnpm test` 在没有后端进程时仍然全绿。
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import process from "node:process";
import { diffResults, runAll } from "../scripts/parity-core.mjs";

const BASELINE_PATH = fileURLToPath(new URL("./fixtures/baseline.original.json", import.meta.url));
const BASE = process.env.PARITY_BASE;

describe("parity: 与改造前原版 Express 行为一致", { skip: BASE ? false : "未设置 PARITY_BASE" }, () => {
  it(`${BASELINE_PATH.split(/[\\/]/).pop()} 的每一条用例都应完全一致`, async () => {
    const expected = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
    const actual = await runAll({ base: BASE.replace(/\/$/, "") });

    const diffs = diffResults(expected, actual);
    assert.deepEqual(
      diffs,
      [],
      diffs.length === 0
        ? ""
        : `发现 ${diffs.length} 处行为差异：\n\n${diffs.join("\n\n")}`,
    );
  });
});
