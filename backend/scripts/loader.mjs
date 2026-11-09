/**
 * Module resolve hook：把 `@supabase/supabase-js` 重定向到本地 shim。
 *
 * 目的：让原版 render-backend/server.js 在**一行不改**的前提下跑在本地 Postgres 上，
 * 从而抓到「改造前」的真实 HTTP 响应作为功能基准（characterization baseline）。
 *
 * 用法见 register-shim.mjs。
 */

const SHIM_URL = new URL("./supabase-shim.js", import.meta.url).href;

/**
 * @param {string} specifier 被 import 的模块名
 * @param {object} context resolve 上下文
 * @param {Function} nextResolve 默认解析器
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@supabase/supabase-js") {
    return { url: SHIM_URL, shortCircuit: true, format: "module" };
  }
  return nextResolve(specifier, context);
}
