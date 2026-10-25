import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = pathToFileURL(
  path.resolve(import.meta.dirname, "../src/utils/gameRuntime.js"),
).href;

/** 每次用例都重新 import，绕开模块内的 runtimePromise 缓存 */
let seq = 0;
async function freshModule() {
  seq += 1;
  return import(`${modulePath}?case=${seq}`);
}

/**
 * 装一个最小 DOM：appendChild 时异步触发 load / error，
 * 并在执行 index.js "时" 挂上 window.__require（模拟真实脚本的副作用）。
 */
function installDom({ failOn } = {}) {
  const appended = [];
  globalThis.window = { setTimeout };
  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: tag,
        src: "",
        dataset: {},
        listeners: new Map(),
        addEventListener(type, cb) {
          this.listeners.set(type, cb);
        },
      };
      return el;
    },
    head: {
      appendChild(el) {
        appended.push(el.src);
        queueMicrotask(() => {
          if (el.src.endsWith(failOn)) {
            el.listeners.get("error")?.();
            return;
          }
          if (el.src.endsWith("/index.js")) {
            globalThis.window.__require = () => ({
              encMsg: () => new Uint8Array([1]),
              lz4XorDecode: () => {},
              lz4XorEncode: () => {},
            });
          }
          el.listeners.get("load")?.();
        });
        return el;
      },
    },
  };
  return appended;
}

test("按顺序注入三段运行时脚本，并解析出 __require", async () => {
  const appended = installDom();
  const { ensureGameRuntime, isGameRuntimeReady } = await freshModule();

  assert.equal(isGameRuntimeReady(), false);
  const rest = await ensureGameRuntime();

  assert.equal(typeof rest, "function");
  assert.deepEqual(appended, [
    "/game-runtime/cocos2d-js-min.js",
    "/game-runtime/game-defines.js",
    "/game-runtime/index.js",
  ]);
  assert.equal(isGameRuntimeReady(), true);
});

test("并发调用共享同一次加载，不会重复插脚本", async () => {
  const appended = installDom();
  const { ensureGameRuntime } = await freshModule();

  const [a, b, c] = await Promise.all([
    ensureGameRuntime(),
    ensureGameRuntime(),
    ensureGameRuntime(),
  ]);

  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(appended.length, 3);
});

test("已经挂载时不再插脚本", async () => {
  const appended = installDom();
  globalThis.window.__require = () => "already-loaded";
  const { ensureGameRuntime } = await freshModule();

  const rest = await ensureGameRuntime();
  assert.equal(rest(), "already-loaded");
  assert.deepEqual(appended, []);
});

test("下载失败后可以重试，第二次能成功", async () => {
  const first = installDom({ failOn: "game-defines.js" });
  const { ensureGameRuntime } = await freshModule();

  await assert.rejects(() => ensureGameRuntime(), /游戏运行时加载失败/);
  // 失败发生在第二段，说明是顺序加载、失败即中断
  assert.equal(first.length, 2);

  // 换一个不失败的 DOM，重试应当从头加载并成功（缓存已重置）
  const second = installDom();
  const rest = await ensureGameRuntime();
  assert.equal(typeof rest, "function");
  assert.equal(second.length, 3);
});

test("getGameCryptoModule 在未加载时给出可读报错", async () => {
  installDom();
  delete globalThis.window.__require;
  const { getGameCryptoModule } = await freshModule();

  assert.throws(() => getGameCryptoModule(), /游戏加密模块未加载/);
});
