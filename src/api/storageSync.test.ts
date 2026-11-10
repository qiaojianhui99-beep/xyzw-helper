import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 每个用例前重置 storage 门面的内部状态 */
async function freshModules() {
  const storageMod = await import("@/api/storage");
  storageMod.__resetForTest();
  vi.resetModules();
  return {
    storageMod,
    sync: await import("@/api/storageSync"),
  };
}

describe("storageSync", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("apiKey 读写与清除", async () => {
    const { storageMod, sync } = await freshModules();
    expect(sync.getApiKey()).toBe("");
    sync.setApiKey("k-123");
    expect(sync.getApiKey()).toBe("k-123");
    expect(storageMod.storage.getItem("apiKey")).toBe("k-123");
    sync.setApiKey("");
    expect(sync.getApiKey()).toBe("");
  });

  it("fetchAllStorage 带 x-api-key 请求 /api/storage/all", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ theme: "dark" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = await freshModules();
    const all = await sync.fetchAllStorage("k-1");
    expect(all).toEqual({ theme: "dark" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/storage/all");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k-1");
  });

  it("fetchAllStorage 非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const { sync } = await freshModules();
    await expect(sync.fetchAllStorage("k")).rejects.toThrow(/HTTP 500/);
  });

  it("pushPatch 把 patch 包在 body 里", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = await freshModules();
    await sync.pushPatch("k", { theme: "light" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/storage/patch");
    expect(JSON.parse(init.body as string)).toEqual({ patch: { theme: "light" } });
  });

  it("pushPatch 非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400 })));
    const { sync } = await freshModules();
    await expect(sync.pushPatch("k", {})).rejects.toThrow(/HTTP 400/);
  });

  it("checkBackend 未配置 key 时明确报告", async () => {
    const { sync } = await freshModules();
    await expect(sync.checkBackend()).resolves.toEqual({ ok: false, reason: "未配置 API Key" });
  });

  it("checkBackend 成功与失败两种结果", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    let mods = await freshModules();
    mods.sync.setApiKey("k");
    await expect(mods.sync.checkBackend()).resolves.toEqual({ ok: true, reason: "连接正常" });

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    mods = await freshModules();
    mods.sync.setApiKey("k");
    const res = await mods.sync.checkBackend();
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("503");
  });

  it("未配置 key 时 bootCloudStorage 返回 false 且不请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = await freshModules();
    await expect(sync.bootCloudStorage()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("配置 key 后 bootCloudStorage 返回 true 并采纳云端值", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ theme: "dark" }) })));
    // 先加载 storageSync，再取 storage —— 保证拿到的是同一条模块实例
    const storageMod = await import("@/api/storage");
    storageMod.__resetForTest();
    const sync = await import("@/api/storageSync");
    sync.setApiKey("k");
    await expect(sync.bootCloudStorage()).resolves.toBe(true);
    expect(storageMod.storage.getItem("theme")).toBe("dark");
    expect(storageMod.isCloudMode()).toBe(true);
  });

  it("后端不可达时 bootCloudStorage 退回本地模式", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502 })));
    const { storageMod, sync } = await freshModules();
    sync.setApiKey("k");
    await expect(sync.bootCloudStorage()).resolves.toBe(false);
    expect(storageMod.isCloudMode()).toBe(false);
  });
});
