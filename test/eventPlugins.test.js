/**
 * 事件插件注册核对。
 *
 * 背景：`src/stores/events/` 下的插件必须由 `index.ts` 装配才会生效。
 * 实际发现过两种偏差：
 *   1. `activity.ts` 的导出名被复制成了 `AckPlugin`（与 ack.ts 同名），且从未注册；
 *   2. `clock.ts` 从未注册。
 * 两个都静默失效了很久 —— 没有报警，只是某些推送走了 `$any` 的 warn 日志。
 *
 * 这个测试保证：除白名单外，events/ 下每个插件都已在 index.ts 里注册。
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVENTS_DIR = path.join(ROOT, "src/stores/events");

/** 故意不装配的插件（改动这里等于改变运行时行为，需产品确认） */
const INTENTIONALLY_UNREGISTERED = new Set(["activity.ts", "clock.ts"]);

describe("事件插件注册", () => {
  it("除白名单外，所有插件都已在 index.ts 注册", async () => {
    const files = (await readdir(EVENTS_DIR)).filter(
      (f) => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts",
    );
    assert.ok(files.length > 0, "events 目录应至少有一个插件");

    const index = await readFile(path.join(EVENTS_DIR, "index.ts"), "utf8");

    const missing = [];
    for (const file of files) {
      if (INTENTIONALLY_UNREGISTERED.has(file)) continue;
      const src = await readFile(path.join(EVENTS_DIR, file), "utf8");
      const exported = [...src.matchAll(/^export const (\w+Plugin)/gm)].map((m) => m[1]);
      assert.ok(
        exported.length > 0,
        `${file} 必须导出一个 *Plugin 函数，否则装配无处可用`,
      );
      for (const name of exported) {
        if (!index.includes(`${name}(evmInst)`)) missing.push(`${file} → ${name}`);
      }
    }

    assert.deepEqual(missing, [], "以下插件没有在 index.ts 注册");
  });

  it("白名单里的插件确实没被注册（否则白名单该删掉）", async () => {
    const index = await readFile(path.join(EVENTS_DIR, "index.ts"), "utf8");
    for (const file of INTENTIONALLY_UNREGISTERED) {
      const src = await readFile(path.join(EVENTS_DIR, file), "utf8");
      const exported = [...src.matchAll(/^export const (\w+Plugin)/gm)].map((m) => m[1]);
      for (const name of exported) {
        assert.ok(
          !index.includes(`${name}(evmInst)`),
          `${file} 已注册（${name}），请从白名单移除`,
        );
      }
    }
  });

  it("插件导出名不重复（曾出现过两个 AckPlugin）", async () => {
    const files = (await readdir(EVENTS_DIR)).filter(
      (f) => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts",
    );
    const seen = new Map();
    for (const file of files) {
      const src = await readFile(path.join(EVENTS_DIR, file), "utf8");
      for (const m of src.matchAll(/^export const (\w+Plugin)/gm)) {
        const name = m[1];
        assert.ok(
          !seen.has(name),
          `导出名 ${name} 同时出现在 ${seen.get(name)} 与 ${file}`,
        );
        seen.set(name, file);
      }
    }
  });
});
