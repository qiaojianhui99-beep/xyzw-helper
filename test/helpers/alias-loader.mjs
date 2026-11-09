/**
 * 测试用模块别名解析器：把 `@/xxx` 解析到 `src/xxx`。
 *
 * 为什么需要：项目源码统一用 `@/` 别名（vite/vitest 会处理），
 * 但 `node --test` 直接 import 源码时不认识这个前缀，会解析失败。
 * 用 module resolve hook 补上，比把测试改成相对路径或让每个测试手写依赖更干净。
 *
 * 只在测试进程生效（通过 --import 注入），不影响生产代码。
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC_DIR = path.resolve(new URL("../../src/", import.meta.url).pathname.replace(/^\/([a-z]:)/i, "$1"));

/** @param {string} abs */
function isFile(abs) {
  try {
    return existsSync(abs) && statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} specifier
 * @param {object} context
 * @param {Function} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const rel = specifier.slice(2);
  const candidates = [
    rel,
    `${rel}.js`,
    `${rel}.ts`,
    `${rel}.mjs`,
    `${rel}/index.js`,
    `${rel}/index.ts`,
  ];

  for (const candidate of candidates) {
    const abs = path.join(SRC_DIR, candidate);
    if (isFile(abs)) {
      return { url: pathToFileURL(abs).href, shortCircuit: true, format: "module" };
    }
  }

  return nextResolve(specifier, context);
}
