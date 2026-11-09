/**
 * 云端同步接线测试。
 *
 * 断言两件事：
 *   1. 未配置 API Key 时完全不影响本地行为（默认零影响是硬要求）
 *   2. 配置后能把 storage 的变更真的推给后端，且失败可感知
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { __resetForTest, flush, isCloudMode, storage } from "../src/api/storage.js";
import {
  API_KEY_STORAGE,
  bootCloudStorage,
  checkBackend,
  fetchAllStorage,
  getApiKey,
  pushPatch,
  setApiKey,
} from "../src/api/storageSync.js";

/** 最小 localStorage 替身。 */
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(i) {
    return [...this.map.keys()][i] ?? null;
  }

  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    this.map.set(String(k), String(v));
  }

  removeItem(k) {
    this.map.delete(k);
  }

  clear() {
    this.map.clear();
  }
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetForTest();
  globalThis.localStorage = new MemoryStorage();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** 安装一个可控的 fetch 替身。 */
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const result = await handler(url, init);
    return {
      ok: result.ok ?? true,
      status: result.status ?? 200,
      json: async () => result.body ?? {},
    };
  };
  return calls;
}

describe("apiKey 存取", () => {
  it("未设置时返回空串", () => {
    assert.equal(getApiKey(), "");
  });

  it("setApiKey 后能读回", () => {
    setApiKey("abc123");
    assert.equal(getApiKey(), "abc123");
    assert.equal(storage.getItem(API_KEY_STORAGE), "abc123");
  });

  it("setApiKey('') 会清除", () => {
    setApiKey("abc");
    setApiKey("");
    assert.equal(getApiKey(), "");
  });
});

describe("未配置 key 时零影响", () => {
  it("bootCloudStorage 返回 false 且不进云端模式", async () => {
    const enabled = await bootCloudStorage();
    assert.equal(enabled, false);
    assert.equal(isCloudMode(), false);
  });

  it("本地读写行为不变", async () => {
    await bootCloudStorage();
    storage.setItem("theme", "dark");
    assert.equal(storage.getItem("theme"), "dark");
    assert.equal(globalThis.localStorage.getItem("theme"), "dark");
  });

  it("checkBackend 明确报告未配置", async () => {
    const r = await checkBackend();
    assert.equal(r.ok, false);
    assert.match(r.reason, /未配置/);
  });
});

describe("已配置 key", () => {
  it("fetchAllStorage 带 x-api-key 请求 /api/storage/all", async () => {
    const calls = mockFetch(() => ({ body: { theme: "dark" } }));
    const all = await fetchAllStorage("k1");
    assert.deepEqual(all, { theme: "dark" });
    assert.equal(calls[0].url, "/api/storage/all");
    assert.equal(calls[0].init.headers["x-api-key"], "k1");
  });

  it("fetchAllStorage 非 2xx 时抛错", async () => {
    mockFetch(() => ({ ok: false, status: 401, body: {} }));
    await assert.rejects(() => fetchAllStorage("bad"), /HTTP 401/);
  });

  it("pushPatch 把 patch 包在 body.patch 里", async () => {
    const calls = mockFetch(() => ({ body: { ok: true } }));
    await pushPatch("k1", { theme: "dark" });
    const sent = JSON.parse(calls[0].init.body);
    assert.deepEqual(sent, { patch: { theme: "dark" } });
    assert.equal(calls[0].init.method, "POST");
  });

  it("bootCloudStorage 成功后进入云端模式并用云端值覆盖", async () => {
    mockFetch(() => ({ body: { theme: "dark", tokenViewMode: "card" } }));
    setApiKey("k1");

    const enabled = await bootCloudStorage();
    assert.equal(enabled, true);
    assert.equal(isCloudMode(), true);
    assert.equal(storage.getItem("theme"), "dark");
  });

  it("boot 后 setItem 会推送到 /api/storage/patch", async () => {
    const calls = mockFetch((url) =>
      url.includes("/all") ? { body: {} } : { body: { ok: true } },
    );
    setApiKey("k1");
    await bootCloudStorage();

    storage.setItem("theme", "light");
    await flush();

    const patchCall = calls.find((c) => c.url === "/api/storage/patch");
    assert.ok(patchCall, "应发起 patch 请求");
    assert.deepEqual(JSON.parse(patchCall.init.body), { patch: { theme: "light" } });
  });

  it("后端不可达时 bootCloudStorage 退回本地模式", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    setApiKey("k1");
    const enabled = await bootCloudStorage();
    assert.equal(enabled, false);
    assert.equal(isCloudMode(), false);
  });

  it("checkBackend 成功后返回 ok", async () => {
    mockFetch(() => ({ body: {} }));
    setApiKey("k1");
    const r = await checkBackend();
    assert.equal(r.ok, true);
  });
});
