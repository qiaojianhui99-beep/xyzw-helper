import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useWarGuess } from "@/composables/useWarGuess";

function setup(overrides: Partial<Parameters<typeof useWarGuess>[0]> = {}) {
  const selectedTokens = ref<string[]>(["t1"]);
  const tokens = ref([{ id: "t1", name: "甲", token: "tk", wsUrl: null }]);
  const message = { warning: vi.fn(), error: vi.fn() };
  const addLog = vi.fn();
  const batchWarGuessCheer = vi.fn(async () => {});
  const deps = {
    selectedTokens,
    tokens,
    getWebSocketStatus: vi.fn(() => "connected"),
    createWebSocketConnection: vi.fn(),
    sendMessageWithPromise: vi.fn(async () => ({
      list: [
        { id: 1, name: "A", totalNum: 10 },
        { id: 2, name: "B", totalNum: 30 },
        { id: 3, name: "C", totalNum: 20 },
      ],
    })),
    message,
    addLog,
    batchWarGuessCheer,
    ...overrides,
  };
  return { api: useWarGuess(deps as never), deps, message, addLog, batchWarGuessCheer };
}

describe("useWarGuess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("初始状态：弹窗关闭、列表为空、默认 20 币", () => {
    const { api } = setup();
    expect(api.showWarGuessModal.value).toBe(false);
    expect(api.warGuessList.value).toEqual([]);
    expect(api.warGuessCoin.value).toBe(20);
    expect(api.selectedWarGuessLegionId.value).toBeNull();
  });

  it("打开弹窗会重置选择并按总热度倒序取前 20", async () => {
    const { api } = setup();
    await api.openWarGuessModal();
    await vi.waitFor(() => expect(api.warGuessLoading.value).toBe(false));
    expect(api.showWarGuessModal.value).toBe(true);
    expect(api.warGuessList.value.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("没有勾选账号时提示且不请求", async () => {
    const selectedTokens = ref<string[]>([]);
    const { api, deps, message } = setup({ selectedTokens } as never);
    await api.fetchWarGuessRank();
    expect(message.warning).toHaveBeenCalledWith("请先选择一个账号用于获取月赛助威数据");
    expect(deps.sendMessageWithPromise).not.toHaveBeenCalled();
  });

  it("账号不存在时提示", async () => {
    const selectedTokens = ref<string[]>(["ghost"]);
    const { api, message } = setup({ selectedTokens } as never);
    await api.fetchWarGuessRank();
    expect(message.warning).toHaveBeenCalledWith("未找到对应账号信息");
  });

  it("未连接时先建连再拉榜", async () => {
    const { api, deps } = setup({
      getWebSocketStatus: vi.fn(() => "disconnected"),
    } as never);
    await api.fetchWarGuessRank();
    expect(deps.createWebSocketConnection).toHaveBeenCalledWith("t1", "tk", null);
    expect(deps.sendMessageWithPromise).toHaveBeenCalledWith(
      "t1",
      "warguess_getrank",
      { bfId: "" },
      5000,
    );
  });

  it("list 是对象时也能展开并排序", async () => {
    const { api } = setup({
      sendMessageWithPromise: vi.fn(async () => ({
        list: { a: { id: "a", totalNum: 5 }, b: { id: "b", totalNum: 9 } },
      })),
    } as never);
    await api.fetchWarGuessRank();
    expect(api.warGuessList.value.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("返回空数据时给出提示", async () => {
    const { api, message } = setup({
      sendMessageWithPromise: vi.fn(async () => ({})),
    } as never);
    await api.fetchWarGuessRank();
    expect(message.warning).toHaveBeenCalledWith("获取月赛助威数据为空");
  });

  it("请求抛错时记录日志并提示，loading 复位", async () => {
    const { api, message, addLog } = setup({
      sendMessageWithPromise: vi.fn(async () => {
        throw new Error("网络错误");
      }),
    } as never);
    await api.fetchWarGuessRank();
    expect(api.warGuessLoading.value).toBe(false);
    expect(message.error).toHaveBeenCalledWith("获取月赛助威数据失败: 网络错误");
    expect(addLog).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", message: "获取月赛助威数据失败: 网络错误" }),
    );
  });

  it("未选俱乐部时助威给出提示", async () => {
    const { api, message, batchWarGuessCheer } = setup();
    await api.handleWarGuessCheer();
    expect(message.warning).toHaveBeenCalledWith("请先选择一个俱乐部");
    expect(batchWarGuessCheer).not.toHaveBeenCalled();
  });

  it("选中俱乐部后助威并关闭弹窗", async () => {
    const { api, batchWarGuessCheer } = setup();
    api.selectedWarGuessLegionId.value = 7;
    api.warGuessCoin.value = 30;
    await api.handleWarGuessCheer();
    expect(batchWarGuessCheer).toHaveBeenCalledWith(7, 30);
    expect(api.showWarGuessModal.value).toBe(false);
  });

  it("行点击会选中对应俱乐部", () => {
    const { api } = setup();
    const props = api.warGuessRowProps({ id: 42 });
    expect(props.style).toContain("pointer");
    props.onClick();
    expect(api.selectedWarGuessLegionId.value).toBe(42);
  });

  it("表格列包含头像与战力的渲染函数", () => {
    const { api } = setup();
    const cols = api.warGuessColumns as Array<Record<string, unknown>>;
    expect(cols).toHaveLength(9);
    const power = cols.find((c) => c.key === "power");
    expect(typeof power?.render).toBe("function");
    const logo = cols.find((c) => c.key === "logo");
    expect(typeof logo?.render).toBe("function");
  });
});
