import { createPinia, setActivePinia } from "pinia";
/**
 * tokenStore 的行为测试。
 *
 * 覆盖范围：Token 生命周期（增删改选）、Base64 解析、导入导出、过期清理、
 * 永久化、分组 CRUD、战斗版本、塔信息、连接状态查询、devTools。
 *
 * 不测的部分：真实 WebSocket 收发（需要服务端），只验证「未连接时的行为」。
 * 所有外部依赖（IndexedDB / 日志 / Token 工具 / WS 客户端 / 事件总线）都 mock，
 * 不改动任何业务代码。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- 外部依赖 mock ----
vi.mock("@/hooks/useIndexedDB", () => ({
  default: () => ({
    getArrayBuffer: vi.fn(async () => null),
    storeArrayBuffer: vi.fn(async () => true),
    deleteArrayBuffer: vi.fn(async () => true),
    clearAll: vi.fn(async () => true),
  }),
}));

vi.mock("@/utils/logger", () => {
  // logger 的方法很多且会随业务增加，用 Proxy 兜底成 noop，避免漏 mock 某个方法
  const noop = () => {};
  const make = () => new Proxy({}, { get: () => noop });
  return { gameLogger: make(), tokenLogger: make(), wsLogger: make(), default: make() };
});

vi.mock("@/utils/bonProtocol", () => ({
  g_utils: {
    createGamePacket: vi.fn(() => ({ cmd: "mock", body: {} })),
    parse: vi.fn(),
    encode: vi.fn(),
  },
  bon: { encode: vi.fn(() => new Uint8Array()), decode: vi.fn(() => ({})) },
  ProtoMsg: class {},
  gameMessages: {},
}));

vi.mock("@/utils/randomSeed", () => ({ generateRandomSeed: vi.fn(() => 123456) }));

vi.mock("@/utils/token", () => ({
  transformToken: vi.fn((raw: string) => raw),
  scheduleAuthUserRequest: vi.fn(async () => null),
  setAuthUserRateLimiterCallback: vi.fn(),
}));

vi.mock("@/utils/wechatForceLogout", () => ({
  refreshTokenFromCombUser: vi.fn(async () => null),
  roleIndexFromServerId: vi.fn(() => 1),
}));

vi.mock("@/utils/xyzwWebSocket", () => ({
  XyzwWebSocketClient: class {
    onOpen: unknown = null;
    onClose: unknown = null;
    onDisconnect: unknown = null;
    onError: unknown = null;
    onMessage: unknown = null;
    connect = vi.fn(async () => {});
    close = vi.fn();
    send = vi.fn(async () => true);
    sendWithPromise = vi.fn(async () => ({ ok: true }));
    reconnect = vi.fn();
  },
}));

vi.mock("@/stores/events/index.js", () => ({
  $emit: { on: vi.fn(), emit: vi.fn(), off: vi.fn() },
  emitPlus: vi.fn(),
}));

vi.mock("@/router", () => ({ default: { currentRoute: { value: { path: "/" } } } }));

// 必须在 mock 之后 import
const { useTokenStore, gameTokens, selectedTokenId, setCurrentPathResolver } =
  await import("@/stores/tokenStore");

/** 造一个合法的最小 TokenData */
function makeToken(overrides: Record<string, unknown> = {}) {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    name: "测试账号",
    token: "AAAA",
    wsUrl: null,
    server: "s1",
    ...overrides,
  };
}

/** 重置模块级状态（gameTokens 是模块级 ref，跨用例共享） */
function resetStoreState() {
  gameTokens.value = [];
  selectedTokenId.value = "";
  setCurrentPathResolver(() => "/");
}

describe("tokenStore · Token 生命周期", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetStoreState();
  });

  it("初始状态没有 token", () => {
    const store = useTokenStore();
    expect(store.gameTokens).toEqual([]);
    expect(store.hasTokens).toBe(false);
    expect(store.selectedToken).toBeUndefined();
  });

  it("addToken 补全字段并写入列表", () => {
    const store = useTokenStore();
    const created = store.addToken(makeToken({ name: "甲" }) as never);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.lastUsed).toBeTruthy();
    expect(created.isActive).toBe(true);
    expect(created.sourceUrl).toBeNull();
    expect(store.gameTokens).toHaveLength(1);
    expect(store.hasTokens).toBe(true);
  });

  it("addToken 本身不做去重（去重由调用方负责）", () => {
    const store = useTokenStore();
    const first = store.addToken(makeToken({ id: "same", name: "dup" }) as never);
    const second = store.addToken(makeToken({ id: "same", name: "dup" }) as never);
    // 真实行为：直接 push；同一 id 会出现两条 —— 记录下来，避免以后误以为有去重
    expect(store.gameTokens).toHaveLength(2);
    expect(second.id).toBe(first.id);
  });

  it("updateToken 合并字段", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken({ name: "乙" }) as never);
    const ok = store.updateToken(t.id, { name: "乙改", remark: "备注" });
    expect(ok).toBe(true);
    const found = store.gameTokens.find((x) => x.id === t.id);
    expect(found?.name).toBe("乙改");
    expect(found?.remark).toBe("备注");
    expect(found?.updatedAt).toBeTruthy();
  });

  it("updateToken 对不存在的 id 返回 false", () => {
    const store = useTokenStore();
    expect(store.updateToken("不存在", { name: "x" })).toBe(false);
  });

  it("removeToken 删除并清空选中态", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    store.selectToken(t.id);
    expect(store.selectedTokenId).toBe(t.id);
    store.removeToken(t.id);
    expect(store.gameTokens).toHaveLength(0);
    expect(store.selectedTokenId).toBe("");
  });

  it("selectToken 选中已存在项并标记 lastUsed", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    store.selectToken(t.id);
    expect(store.selectedTokenId).toBe(t.id);
    expect(store.selectedToken?.id).toBe(t.id);
  });

  it("selectToken 对不存在的 id 返回 null 且不改变选中态", () => {
    const store = useTokenStore();
    expect(store.selectToken("ghost")).toBeNull();
    expect(store.selectedTokenId).toBe("");
  });
});

describe("tokenStore · Base64 解析与校验", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetStoreState();
  });

  it("解析 JSON 包装的 token", () => {
    const store = useTokenStore();
    const json = JSON.stringify({
      token: "ABCDEFGHIJKLMNOP",
      server: "s9",
      name: "角色",
    });
    const res = store.parseBase64Token(json);
    expect(res.success).toBe(true);
    expect(res.data?.actualToken).toBe("ABCDEFGHIJKLMNOP");
  });

  it("解析纯 base64 串", () => {
    const store = useTokenStore();
    const res = store.parseBase64Token(btoa("PLAINTOKENVALUE"));
    expect(res.success).toBe(true);
    expect(res.data?.actualToken).toBe("PLAINTOKENVALUE");
  });

  it("空输入返回失败", () => {
    const store = useTokenStore();
    const res = store.parseBase64Token("");
    expect(res.success).toBe(false);
    expect(res.error).toContain("解析失败");
  });

  it("validateToken 对空串 / 过短 / 非字符串返回 false，够长的串返回 true", () => {
    const store = useTokenStore();
    expect(store.validateToken("")).toBe(false);
    expect(store.validateToken("ab")).toBe(false);
    expect(store.validateToken(null)).toBe(false);
    expect(store.validateToken(123 as never)).toBe(false);
    expect(store.validateToken("a".repeat(64))).toBe(true);
  });
});

describe("tokenStore · 导入导出与清理", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetStoreState();
  });

  it("exportTokens 产出 { tokens, exportedAt, version } 结构", () => {
    const store = useTokenStore();
    store.addToken(makeToken({ name: "导出" }) as never);
    const exported = store.exportTokens();
    expect(Array.isArray(exported.tokens)).toBe(true);
    expect(exported.tokens[0]!.name).toBe("导出");
    expect(exported.version).toBe("2.0");
    expect(exported.exportedAt).toBeTruthy();
  });

  it("importTokens 用导入内容整体替换列表", () => {
    const store = useTokenStore();
    store.addToken(makeToken({ name: "旧" }) as never);
    const res = store.importTokens({
      tokens: [makeToken({ id: "a", name: "A" }), makeToken({ id: "b", name: "B" })],
    });
    expect(res.success).toBe(true);
    expect(store.gameTokens).toHaveLength(2);
    expect(store.gameTokens.map((t) => t.name)).toEqual(["A", "B"]);
  });

  it("importTokens 对缺少 tokens 的数据返回失败", () => {
    const store = useTokenStore();
    expect(store.importTokens({ nope: 1 }).success).toBe(false);
  });

  it("clearAllTokens 清空列表与选中态", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    store.selectToken(t.id);
    store.clearAllTokens();
    expect(store.gameTokens).toEqual([]);
    expect(store.selectedTokenId).toBe("");
  });

  it("cleanExpiredTokens 删除超过 24 小时的手动 token，保留永久 token", async () => {
    const store = useTokenStore();
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const expired = store.addToken(makeToken({ name: "旧", importMethod: "manual" }) as never);
    store.updateToken(expired.id, { lastUsed: old, createdAt: old });
    const permanent = store.addToken(makeToken({ name: "永久", upgradedToPermanent: true }) as never);

    const cleaned = await store.cleanExpiredTokens();
    const ids = store.gameTokens.map((t) => t.id);
    expect(cleaned).toBe(1);
    expect(ids).toContain(permanent.id);
    expect(ids).not.toContain(expired.id);
  });

  it("bin / url / mobile 导入的 token 不会因时间过期", async () => {
    const store = useTokenStore();
    const old = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    for (const method of ["bin", "url", "mobile"] as const) {
      const t = store.addToken(makeToken({ name: method, importMethod: method }) as never);
      store.updateToken(t.id, { lastUsed: old, createdAt: old });
    }
    const cleaned = await store.cleanExpiredTokens();
    expect(cleaned).toBe(0);
    expect(store.gameTokens).toHaveLength(3);
  });

  it("没有时间信息的 token 不会被误删", async () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken({ name: "无时间" }) as never);
    store.updateToken(t.id, { lastUsed: undefined, createdAt: undefined });
    await store.cleanExpiredTokens();
    expect(store.gameTokens.map((x) => x.id)).toContain(t.id);
  });

  it("upgradeTokenToPermanent 设置标记与时间", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    const ok = store.upgradeTokenToPermanent(t.id);
    expect(ok).toBe(true);
    const found = store.gameTokens.find((x) => x.id === t.id);
    expect(found?.upgradedToPermanent).toBe(true);
    expect(found?.upgradedAt).toBeTruthy();
  });

  it("upgradeTokenToPermanent 对不存在的 id 返回 false", () => {
    const store = useTokenStore();
    expect(store.upgradeTokenToPermanent("ghost")).toBe(false);
  });
});

describe("tokenStore · 分组管理", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetStoreState();
  });

  it("createTokenGroup 建组", () => {
    const store = useTokenStore();
    const g = store.createTokenGroup("主力", "#1677ff");
    expect(g.id).toBeTruthy();
    expect(store.tokenGroups).toHaveLength(1);
    expect(store.tokenGroups[0]!.name).toBe("主力");
  });

  it("updateTokenGroup 改名改色", () => {
    const store = useTokenStore();
    const g = store.createTokenGroup("旧名", "#000000");
    store.updateTokenGroup(g.id, { name: "新名", color: "#ffffff" });
    const found = store.tokenGroups.find((x) => x.id === g.id);
    expect(found?.name).toBe("新名");
    expect(found?.color).toBe("#ffffff");
  });

  it("addTokenToGroup / getTokenGroups / getGroupTokenIds 联动", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    const g = store.createTokenGroup("组1", "#1677ff");
    store.addTokenToGroup(g.id, t.id);
    expect(store.getTokenGroups(t.id).map((x) => x.id)).toContain(g.id);
    expect(store.getGroupTokenIds(g.id)).toContain(t.id);
    expect(store.getValidGroupTokenIds(g.id)).toContain(t.id);
  });

  it("同一 token 重复加入同一分组不会重复记录", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    const g = store.createTokenGroup("组2", "#1677ff");
    store.addTokenToGroup(g.id, t.id);
    store.addTokenToGroup(g.id, t.id);
    expect(store.getGroupTokenIds(g.id).filter((id) => id === t.id)).toHaveLength(1);
  });

  it("removeTokenFromGroup 移除", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    const g = store.createTokenGroup("组3", "#1677ff");
    store.addTokenToGroup(g.id, t.id);
    store.removeTokenFromGroup(g.id, t.id);
    expect(store.getGroupTokenIds(g.id)).not.toContain(t.id);
  });

  it("deleteTokenGroup 删组", () => {
    const store = useTokenStore();
    const g = store.createTokenGroup("待删", "#1677ff");
    store.deleteTokenGroup(g.id);
    expect(store.tokenGroups.find((x) => x.id === g.id)).toBeUndefined();
  });

  it("getValidGroupTokenIds 过滤掉已删除的 token", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    const g = store.createTokenGroup("组4", "#1677ff");
    store.addTokenToGroup(g.id, t.id);
    store.removeToken(t.id);
    expect(store.getValidGroupTokenIds(g.id)).toEqual([]);
    expect(store.getGroupTokenIds(g.id)).toContain(t.id);
  });

  it("cleanupInvalidTokens 清理分组里失效的 id", () => {
    const store = useTokenStore();
    const t = store.addToken(makeToken() as never);
    const g = store.createTokenGroup("组5", "#1677ff");
    store.addTokenToGroup(g.id, t.id);
    store.removeToken(t.id);
    store.cleanupInvalidTokens();
    expect(store.getGroupTokenIds(g.id)).toEqual([]);
  });
});

describe("tokenStore · 版本、塔与连接状态", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetStoreState();
  });

  it("battleVersion 读写", () => {
    const store = useTokenStore();
    store.setBattleVersion(42);
    expect(store.getBattleVersion()).toBe(42);
  });

  it("未连接时 getWebSocketStatus 返回 disconnected", () => {
    const store = useTokenStore();
    expect(store.getWebSocketStatus("nope")).toBe("disconnected");
    expect(store.getWebSocketClient("nope")).toBeNull();
  });

  it("getTowerInfo / getCurrentTowerLevel 在无角色数据时返回 null", () => {
    const store = useTokenStore();
    expect(store.getCurrentTowerLevel()).toBeNull();
    expect(store.getTowerInfo()).toBeNull();
  });

  it("有角色塔数据时能读出层数", () => {
    const store = useTokenStore();
    store.gameData.roleInfo = { role: { tower: { level: 17 } } } as never;
    expect(store.getCurrentTowerLevel()).toBe(17);
    expect(store.getTowerInfo()).toEqual({ level: 17 });
  });

  it("devTools 暴露连接统计", () => {
    const store = useTokenStore();
    const stats = store.devTools.getConnectionStats();
    expect(stats.totalConnections).toBe(0);
    expect(stats.duplicateTokens).toEqual([]);
  });

  it("validateConnectionUniqueness 对无连接的 token 报告唯一", () => {
    const store = useTokenStore();
    const res = store.validateConnectionUniqueness("ghost");
    expect(res).toBeTruthy();
  });
});

describe("tokenStore · 未连接时发送消息的行为", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetStoreState();
  });

  it("sendMessage 对未连接 token 返回 false", async () => {
    const store = useTokenStore();
    const result = await store.sendMessage("ghost", "role_getroleinfo", {});
    expect(result).toBe(false);
  });

  it("sendMessageWithPromise 对未连接 token 抛错", async () => {
    const store = useTokenStore();
    await expect(store.sendMessageWithPromise("ghost", "role_getroleinfo", {}, 100)).rejects.toThrow();
  });

  it("sendHeartbeat 未连接时同步返回 false", () => {
    const store = useTokenStore();
    expect(store.sendHeartbeat("ghost")).toBe(false);
  });

  it("sendGetRoleInfo 未连接时 reject（而不是静默成功）", async () => {
    const store = useTokenStore();
    await expect(store.sendGetRoleInfo("ghost")).rejects.toThrow(/WebSocket未连接/);
  });
});
