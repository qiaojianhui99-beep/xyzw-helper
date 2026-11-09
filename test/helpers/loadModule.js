import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

/**
 * storage facade 的懒加载单例。
 *
 * 用动态 import 而非顶层 await：ESLint 的 antfu/no-top-level-await 禁止顶层 await，
 * 且这里本来也不需要 —— 首次 loadModule 时才需要它。
 *
 * @returns {Promise<object>} storage 模块
 */
let storageModulePromise = null;
function getStorageModule() {
  storageModulePromise ??= import("../../src/api/storage.js");
  return storageModulePromise;
}

/**
 * Execute a real source module with isolated browser/network dependencies.
 *
 * 两点必要处理：
 *   1. `@/api/storage` 是项目内的别名路径，vm 的自定义 require 看不到它 ——
 *      这里直接注入真实的 storage 模块，避免每个测试都手写这个依赖。
 *   2. storage 是进程级单例（内部有内存镜像）。每个测试用不同的 localStorage 替身，
 *      因此在加载前重置镜像，并把替身同步到 node 全局，让 facade 与测试看到同一份存储。
 *
 * @param {URL} url Module under test.
 * @param {object} dependencies Explicit module dependency replacements.
 * @param {object} globals Browser and timer globals for the isolated context.
 * @returns {Promise<object>} Runtime exports from the transpiled source.
 */
export async function loadModule(url, dependencies = {}, globals = {}) {
  const storageModule = await getStorageModule();

  // 每个用例一份干净的镜像，避免上一个用例的数据泄漏进来
  storageModule.__resetForTest();
  if (globals.localStorage) globalThis.localStorage = globals.localStorage;

  const source = await readFile(url, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: url.pathname,
  });
  const exports = {};
  vm.runInNewContext(
    outputText,
    {
      exports,
      require(name) {
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        if (name === "@/api/storage") return storageModule;
        throw new Error(`Unexpected dependency: ${name}`);
      },
      console,
      setTimeout,
      clearTimeout,
      ...globals,
    },
    { filename: url.pathname },
  );
  return exports;
}
