/**
 * 游戏运行时（cc + __require 模块表）按需加载器。
 *
 * 背景：`src/xyzw/**` 是原样搬运的游戏代码产物（1.78 MB 引擎 + 2.39 MB index.js），
 * 以前直接挂在 index.html 上，任何页面首屏都要先下载并执行 4 MB 才能挂载 Vue。
 * 实际上只有「Token 管理页」生成登录 bin 时才用得到 `window.__require("13")` 的加密模块，
 * 所以改成按需注入：页面空闲时预取，真正用到时 await 兜底。
 *
 * 约束：`src/xyzw/**` 不允许改动，这里只负责「什么时候加进页面」。
 */

/** 按执行顺序排列，index.js 依赖前两个建立的全局对象（cc / PLATFORM 等）。 */
const RUNTIME_FILES = [
  "cocos2d-js-min.js",
  "game-defines.js",
  "index.js",
];

/**
 * 统一路径：生产由 emit-game-runtime 插件原样拷到 dist/game-runtime/，
 * 开发由 vite.config.js 里的 game-runtime-dev 中间件直接吐原始文件（不过 transform）。
 * 用 import.meta.env 是否可用做判断，保证纯 Node（单测）环境下也能加载本模块。
 */
function runtimeBase() {
  const base = import.meta.env ? import.meta.env.BASE_URL : "/";
  return `${base}game-runtime`.replace(/\/{2,}/g, "/");
}

/** @type {Promise<any> | null} */
let runtimePromise = null;

/** 运行时是否已经挂载完成 */
export function isGameRuntimeReady() {
  return typeof window !== "undefined" && Boolean(window.__require);
}

/** 同步拿到加密模块，未加载时抛出可读错误（保持原有报错文案语义） */
export function getGameCryptoModule() {
  const mod = window.__require?.("13");
  if (!mod?.encMsg || !mod?.lz4XorEncode) {
    throw new Error("游戏加密模块未加载，不能生成登录凭据");
  }
  return mod;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset.gameRuntime = "1";
    el.addEventListener("load", () => resolve(undefined), { once: true });
    el.addEventListener(
      "error",
      () => reject(new Error(`游戏运行时加载失败：${src}`)),
      { once: true },
    );
    document.head.appendChild(el);
  });
}

/**
 * 确保游戏运行时已就绪，返回 `window.__require`。
 * 并发调用共享同一个 Promise；失败后可重试。
 */
export function ensureGameRuntime() {
  if (isGameRuntimeReady()) return Promise.resolve(window.__require);
  if (!runtimePromise) {
    const base = runtimeBase();
    runtimePromise = RUNTIME_FILES.reduce(
      (chain, file) => chain.then(() => loadScript(`${base}/${file}`)),
      Promise.resolve(),
    )
      .then(() => {
        if (!isGameRuntimeReady()) {
          throw new Error("游戏运行时已加载，但 __require 未挂载");
        }
        return window.__require;
      })
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}

/** 空闲时预取，不阻塞渲染、不抛错（失败等真正用到时再 await 重试）。 */
export function prefetchGameRuntime() {
  if (isGameRuntimeReady()) return;
  const run = () => {
    ensureGameRuntime().catch(() => {});
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 3000 });
    return;
  }
  window.setTimeout(run, 300);
}
