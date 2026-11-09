/**
 * 同步存储门面测试。
 *
 * 断言的是「与 localStorage 行为等价」这件事本身 ——
 * 这是 96 处调用点能安全替换成 storage 的唯一依据。
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  __resetForTest,
  boot,
  flush,
  hydrate,
  isCloudMode,
  isSyncable,
  setCloudPusher,
  snapshot,
  storage,
  useLocalOnly,
} from "../src/api/storage.js";

/** 最小 localStorage 替身，行为与浏览器一致（值一律字符串）。 */
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

beforeEach(() => {
  __resetForTest();
  globalThis.localStorage = new MemoryStorage();
});

describe("与 localStorage 等价", () => {
  it("getItem 未设置时返回 null", () => {
    assert.equal(storage.getItem("nope"), null);
  });

  it("setItem 后 getItem 原样返回字符串", () => {
    storage.setItem("theme", "dark");
    assert.equal(storage.getItem("theme"), "dark");
  });

  it("setItem 把非字符串值转成字符串（与 localStorage 一致）", () => {
    storage.setItem("n", 42);
    assert.equal(storage.getItem("n"), "42");
    storage.setItem("o", { a: 1 });
    assert.equal(storage.getItem("o"), "[object Object]");
  });

  it("同时写入底层 localStorage（断网/降级时仍可用）", () => {
    storage.setItem("k", "v");
    assert.equal(globalThis.localStorage.getItem("k"), "v");
  });

  it("removeItem 同时移除镜像与底层", () => {
    storage.setItem("k", "v");
    storage.removeItem("k");
    assert.equal(storage.getItem("k"), null);
    assert.equal(globalThis.localStorage.getItem("k"), null);
  });

  it("length / key(i) 与底层一致", () => {
    storage.setItem("a", "1");
    storage.setItem("b", "2");
    assert.equal(storage.length, 2);
    const keys = [storage.key(0), storage.key(1)].sort();
    assert.deepEqual(keys, ["a", "b"]);
    assert.equal(storage.key(99), null);
  });

  it("clear 清空全部", () => {
    storage.setItem("a", "1");
    storage.clear();
    assert.equal(storage.length, 0);
    assert.equal(globalThis.localStorage.length, 0);
  });

  it("JSON 序列化往返（项目里的实际用法）", () => {
    const value = [{ id: "x", name: "alpha" }];
    storage.setItem("gameTokens", JSON.stringify(value));
    assert.deepEqual(JSON.parse(storage.getItem("gameTokens")), value);
  });
});

describe("boot 与镜像", () => {
  it("boot 把已有 localStorage 数据装进镜像", async () => {
    globalThis.localStorage.setItem("gameTokens", "[]");
    globalThis.localStorage.setItem("theme", "light");
    await boot();
    assert.equal(storage.getItem("theme"), "light");
    assert.equal(storage.getItem("gameTokens"), "[]");
  });

  it("云端拉取成功时覆盖本地同名键", async () => {
    globalThis.localStorage.setItem("theme", "light");
    await boot({ cloud: true, fetchAll: async () => ({ theme: "dark" }) });
    assert.equal(isCloudMode(), true);
    assert.equal(storage.getItem("theme"), "dark");
  });

  it("云端拉取失败时退回本地模式，不阻断启动", async () => {
    globalThis.localStorage.setItem("theme", "light");
    await boot({
      cloud: true,
      fetchAll: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(isCloudMode(), false);
    assert.equal(storage.getItem("theme"), "light");
  });

  it("useLocalOnly 退出云端模式", async () => {
    await boot({ cloud: true, fetchAll: async () => ({}) });
    assert.equal(isCloudMode(), true);
    useLocalOnly();
    assert.equal(isCloudMode(), false);
  });
});

describe("云端同步", () => {
  it("本地模式不推送", async () => {
    const pushed = [];
    setCloudPusher(async (p) => pushed.push(p));
    await boot();
    storage.setItem("theme", "dark");
    await flush();
    assert.equal(pushed.length, 0);
  });

  it("云端模式 setItem 后防抖推送，payload 只含变更键", async () => {
    const pushed = [];
    setCloudPusher(async (p) => pushed.push(p));
    await boot({ cloud: true, fetchAll: async () => ({}) });

    storage.setItem("theme", "dark");
    storage.setItem("tokenViewMode", "card");
    await new Promise((r) => setTimeout(r, 900));

    assert.equal(pushed.length, 1);
    assert.deepEqual(pushed[0], { theme: "dark", tokenViewMode: "card" });
  });

  it("removeItem 推送 null（表示删除）", async () => {
    const pushed = [];
    setCloudPusher(async (p) => pushed.push(p));
    await boot({ cloud: true, fetchAll: async () => ({}) });

    storage.setItem("theme", "dark");
    await flush();
    storage.removeItem("theme");
    await flush();

    assert.deepEqual(pushed[1], { theme: null });
  });

  it("推送失败时保留脏键，下次 flush 重试", async () => {
    let attempt = 0;
    const pushed = [];
    setCloudPusher(async (p) => {
      attempt += 1;
      if (attempt === 1) throw new Error("network");
      pushed.push(p);
    });

    await boot({ cloud: true, fetchAll: async () => ({}) });
    storage.setItem("theme", "dark");

    assert.equal(await flush(), false, "首次应失败");
    assert.equal(await flush(), true, "重试应成功");
    assert.deepEqual(pushed[0], { theme: "dark" });
  });

  it("黑名单键永不推送", async () => {
    const pushed = [];
    setCloudPusher(async (p) => pushed.push(p));
    await boot({ cloud: true, fetchAll: async () => ({}) });

    for (const k of [
      "activeConnections",
      "bin_data_abc",
      "ws_connection_x",
      "xyzw_chat_msg_list",
      "test",
      "daily-settings:123",
    ]) {
      assert.equal(isSyncable(k), false, `${k} 不应同步`);
      storage.setItem(k, "v");
    }
    await flush();
    assert.equal(pushed.length, 0);
  });

  it("可同步键判定正确", () => {
    for (const k of ["theme", "gameTokens", "tokenViewMode", "userPreferences", "batchSettings"]) {
      assert.equal(isSyncable(k), true, `${k} 应同步`);
    }
  });
});

describe("迁移辅助", () => {
  it("hydrate 批量写入但不触发推送", async () => {
    const pushed = [];
    setCloudPusher(async (p) => pushed.push(p));
    await boot({ cloud: true, fetchAll: async () => ({}) });

    hydrate({ theme: "dark", tokenSortConfig: "{}" });
    await flush();

    assert.equal(storage.getItem("theme"), "dark");
    assert.equal(storage.getItem("tokenSortConfig"), "{}");
    assert.equal(pushed.length, 0, "hydrate 不应产生推送");
  });

  it("snapshot 返回全部键值", () => {
    storage.setItem("a", "1");
    storage.setItem("b", "2");
    assert.deepEqual(snapshot(), { a: "1", b: "2" });
  });
});
