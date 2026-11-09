/**
 * 存储单通道门禁（P0-1）。
 *
 * 守的是一条不变式：**storage facade 是这批键的唯一写入者**。
 * 只要有人再引入一条绕过 facade 的通道（例如直接用 window.localStorage、
 * 或退回 VueUse 的 useLocalStorage），这里就会红 —— 因为镜像读不到直写。
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
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
  subscribe,
  useLocalOnly,
} from "../src/api/storage.js";
import { usePersistentRef } from "../src/composables/usePersistentRef.ts";

/** 最小 localStorage 替身：与浏览器行为同构 */
function installFakeLocalStorage() {
  const map = new Map();
  globalThis.localStorage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
  return map;
}

beforeEach(() => {
  __resetForTest();
  installFakeLocalStorage();
});

afterEach(() => {
  __resetForTest();
  delete globalThis.localStorage;
});

describe("storage facade 的镜像一致性", () => {
  it("setItem 后 getItem 立即可读，且 localStorage 同步写入", () => {
    storage.setItem("gameTokens", "[]");
    assert.equal(storage.getItem("gameTokens"), "[]");
    assert.equal(globalThis.localStorage.getItem("gameTokens"), "[]");
  });

  it("removeItem 后两处一起消失", () => {
    storage.setItem("k", "v");
    storage.removeItem("k");
    assert.equal(storage.getItem("k"), null);
    assert.equal(globalThis.localStorage.getItem("k"), null);
  });

  it("subscribe 在写入与删除时都收到广播", () => {
    const seen = [];
    const off = subscribe("k", (raw) => seen.push(raw));
    storage.setItem("k", "1");
    storage.removeItem("k");
    off();
    storage.setItem("k", "2");
    assert.deepEqual(seen, ["1", null]);
  });

  it("退订后不再收到广播", () => {
    let hits = 0;
    const off = subscribe("k", () => {
      hits += 1;
    });
    storage.setItem("k", "a");
    off();
    storage.setItem("k", "b");
    assert.equal(hits, 1);
  });

  it("订阅者抛异常不影响其他订阅者与写入", () => {
    const seen = [];
    subscribe("k", () => {
      throw new Error("boom");
    });
    subscribe("k", (raw) => seen.push(raw));
    storage.setItem("k", "v");
    assert.deepEqual(seen, ["v"]);
    assert.equal(storage.getItem("k"), "v");
  });
});

describe("usePersistentRef 与 facade 双向绑定", () => {
  it("初始化时从 facade 读值", () => {
    storage.setItem("selectedTokenId", "abc");
    const id = usePersistentRef("selectedTokenId", "");
    assert.equal(id.value, "abc");
  });

  it("ref 写入立刻反映到 facade 与 localStorage", () => {
    const list = usePersistentRef("gameTokens", []);
    list.value = [{ id: "t1" }];
    assert.equal(storage.getItem("gameTokens"), JSON.stringify([{ id: "t1" }]));
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem("gameTokens")), [{ id: "t1" }]);
  });

  it("外部（云端/别的调用点）写入会同步进 ref", () => {
    const id = usePersistentRef("selectedTokenId", "");
    storage.setItem("selectedTokenId", "remote-value");
    assert.equal(id.value, "remote-value");
  });

  it("对象序列化与 VueUse 兼容：存量 JSON 可直接读出", () => {
    globalThis.localStorage.setItem("tokenGroups", JSON.stringify([{ id: "g1" }]));
    const groups = usePersistentRef("tokenGroups", []);
    assert.deepEqual(groups.value, [{ id: "g1" }]);
  });

  it("赋 null 等于删除该键", () => {
    storage.setItem("selectedRoleInfo", "{}");
    const info = usePersistentRef("selectedRoleInfo", null);
    info.value = null;
    assert.equal(storage.getItem("selectedRoleInfo"), null);
  });
});

describe("云端同步的合并语义", () => {
  it("云端独有的键会被采纳并写入 localStorage", async () => {
    const enabled = await boot({
      cloud: true,
      fetchAll: async () => ({ theme: "dark" }),
    });
    assert.equal(enabled, true);
    assert.equal(storage.getItem("theme"), "dark");
    assert.equal(globalThis.localStorage.getItem("theme"), "dark");
  });

  it("本地独有的键不丢，且被标记为待上传", async () => {
    storage.setItem("selectedTokenId", "local-only");
    const pushed = [];
    setCloudPusher(async (patch) => {
      pushed.push(patch);
    });
    await boot({ cloud: true, fetchAll: async () => ({}) });
    storage.setItem("selectedTokenId", "local-only-2");
    await flush();
    assert.equal(storage.getItem("selectedTokenId"), "local-only-2");
    assert.ok(pushed.length > 0, "本地变更应被推送");
  });

  it("冲突时保留本地值，不被旧云端值覆盖", async () => {
    storage.setItem("gameTokens", JSON.stringify([{ id: "local" }]));
    await boot({
      cloud: true,
      fetchAll: async () => ({ gameTokens: JSON.stringify([{ id: "remote" }]) }),
    });
    assert.deepEqual(JSON.parse(storage.getItem("gameTokens")), [{ id: "local" }]);
  });

  it("云端 updatedAt 更新时采纳云端（另一台设备改过）", async () => {
    storage.setItem("theme", "light");
    const future = new Date(Date.now() + 60_000).toISOString();
    await boot({
      cloud: true,
      fetchAll: async () => ({ theme: { value: "dark", updatedAt: future } }),
    });
    assert.equal(storage.getItem("theme"), "dark");
    assert.equal(globalThis.localStorage.getItem("theme"), "dark");
  });

  it("本地写入更晚时保留本地（不被旧云端值覆盖）", async () => {
    storage.setItem("theme", "light");
    const past = new Date(Date.now() - 60_000).toISOString();
    await boot({
      cloud: true,
      fetchAll: async () => ({ theme: { value: "dark", updatedAt: past } }),
    });
    assert.equal(storage.getItem("theme"), "light");
  });

  it("写入时间戳跨 boot 保留，刷新后仍能正确判序", async () => {
    storage.setItem("tokenViewMode", "card");
    const meta = JSON.parse(globalThis.localStorage.getItem("__storageLastWriteAt"));
    assert.equal(typeof meta.tokenViewMode, "number", "内部键应记录写入时间");
    assert.equal(snapshot().__storageLastWriteAt, undefined, "快照不应暴露内部元数据键");
    // 模拟页面刷新：镜像重建，但 localStorage 里的时间戳还在
    const past = new Date(Date.now() - 60_000).toISOString();
    await boot({
      cloud: true,
      fetchAll: async () => ({ tokenViewMode: { value: "list", updatedAt: past } }),
    });
    assert.equal(storage.getItem("tokenViewMode"), "card");
  });

  it("拉取失败时退回纯本地模式，不阻断启动", async () => {
    const enabled = await boot({
      cloud: true,
      fetchAll: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(enabled, false);
    assert.equal(isCloudMode(), false);
  });

  it("NEVER_SYNC 的键进镜像但不推送", async () => {
    const pushed = [];
    setCloudPusher(async (patch) => {
      pushed.push(patch);
    });
    await boot({ cloud: true, fetchAll: async () => ({}) });
    storage.setItem("activeConnections", "{}");
    await flush();
    assert.equal(isSyncable("activeConnections"), false);
    assert.equal(storage.getItem("activeConnections"), "{}", "镜像必须有值");
    assert.ok(!pushed.some((p) => "activeConnections" in p), "不应推送云端");
  });

  it("退出云端模式后不再推送", async () => {
    const pushed = [];
    setCloudPusher(async (patch) => {
      pushed.push(patch);
    });
    await boot({ cloud: true, fetchAll: async () => ({}) });
    useLocalOnly();
    storage.setItem("theme", "light");
    await flush();
    assert.deepEqual(pushed, []);
  });
});

describe("快照与导入", () => {
  it("snapshot 返回镜像全量字符串", () => {
    storage.setItem("a", "1");
    storage.setItem("b", "2");
    assert.deepEqual(snapshot(), { a: "1", b: "2" });
  });

  it("hydrate 写入镜像、localStorage 并广播", () => {
    const seen = [];
    subscribe("x", (raw) => seen.push(raw));
    hydrate({ x: "9" });
    assert.equal(storage.getItem("x"), "9");
    assert.equal(globalThis.localStorage.getItem("x"), "9");
    assert.deepEqual(seen, ["9"]);
  });

  it("hydrate 忽略非字符串值", () => {
    hydrate({ y: 123 });
    assert.equal(storage.getItem("y"), null);
  });
});

describe("配额失败的行为", () => {
  it("localStorage 写入抛错时异常向上传播，镜像不更新", () => {
    const original = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      assert.throws(() => storage.setItem("big", "x"), /QuotaExceededError/);
      assert.equal(storage.getItem("big"), null);
    } finally {
      globalThis.localStorage.setItem = original;
    }
  });
});
