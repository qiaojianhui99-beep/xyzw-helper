import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useTokenGroups } from "@/composables/useTokenGroups";

/** 造一个内存版 store，行为对齐 tokenStore 的分组方法 */
function createFakeStore(initialTokens = [{ id: "t1" }, { id: "t2" }]) {
  const groups: Array<{ id: string; name: string; color: string; tokenIds: string[] }> = [];
  let seq = 0;
  const tokens = [...initialTokens];

  return {
    groups,
    store: {
      createTokenGroup: vi.fn((name: string, color: string) => {
        const g = { id: `g${++seq}`, name, color, tokenIds: [] as string[] };
        groups.push(g);
        return g;
      }),
      updateTokenGroup: vi.fn((id: string, patch: { name?: string; color?: string }) => {
        const g = groups.find((x) => x.id === id);
        if (g) Object.assign(g, patch);
      }),
      deleteTokenGroup: vi.fn((id: string) => {
        const i = groups.findIndex((x) => x.id === id);
        if (i >= 0) groups.splice(i, 1);
      }),
      addTokenToGroup: vi.fn((id: string, tokenId: string) => {
        const g = groups.find((x) => x.id === id);
        if (g && !g.tokenIds.includes(tokenId)) g.tokenIds.push(tokenId);
      }),
      removeTokenFromGroup: vi.fn((id: string, tokenId: string) => {
        const g = groups.find((x) => x.id === id);
        if (g) g.tokenIds = g.tokenIds.filter((t) => t !== tokenId);
      }),
      getValidGroupTokenIds: vi.fn((id: string) => {
        const g = groups.find((x) => x.id === id);
        return (g?.tokenIds ?? []).filter((t) => tokens.some((x) => x.id === t));
      }),
    },
    removeToken: (id: string) => {
      const i = tokens.findIndex((t) => t.id === id);
      if (i >= 0) tokens.splice(i, 1);
    },
  };
}

function setup() {
  const fake = createFakeStore();
  const tokenGroups = ref(fake.groups as never);
  const selectedTokens = ref<string[]>([]);
  const sortedTokens = ref([{ id: "t1" }, { id: "t2" }]);
  const message = { success: vi.fn(), warning: vi.fn() };
  const api = useTokenGroups({
    tokenGroups,
    selectedTokens,
    sortedTokens,
    message,
    store: fake.store,
  });
  return { api, fake, tokenGroups, selectedTokens, message };
}

describe("useTokenGroups", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("创建分组：名称必填", () => {
    const { api, message, fake } = setup();
    api.createNewGroup();
    expect(message.warning).toHaveBeenCalledWith("请输入分组名称");
    expect(fake.groups).toHaveLength(0);
  });

  it("创建分组时带上勾选的 token", () => {
    const { api, fake } = setup();
    api.newGroupName.value = "  主力  ";
    api.newGroupColor.value = "#1677ff";
    api.newGroupSelectedTokens.value = ["t1", "t2"];
    api.createNewGroup();
    expect(fake.groups[0]!.name).toBe("主力");
    expect(fake.groups[0]!.tokenIds).toEqual(["t1", "t2"]);
    // 表单被重置
    expect(api.newGroupName.value).toBe("");
    expect(api.newGroupColor.value).toBe("#1677ff");
    expect(api.newGroupSelectedTokens.value).toEqual([]);
  });

  it("全选 / 反选新建分组的账号", () => {
    const { api } = setup();
    api.selectAllNewGroup();
    expect(api.newGroupSelectedTokens.value).toEqual(["t1", "t2"]);
    api.deselectAllNewGroup();
    expect(api.newGroupSelectedTokens.value).toEqual([]);
  });

  it("删除分组需要确认；取消则不删", () => {
    const { api, fake, message } = setup();
    api.newGroupName.value = "x";
    api.createNewGroup();
    vi.stubGlobal("confirm", vi.fn(() => false));
    api.deleteGroup(fake.groups[0]!.id);
    expect(fake.groups).toHaveLength(1);

    vi.stubGlobal("confirm", vi.fn(() => true));
    api.deleteGroup(fake.groups[0]!.id);
    expect(fake.groups).toHaveLength(0);
    expect(message.success).toHaveBeenCalledWith("分组已删除");
    vi.unstubAllGlobals();
  });

  it("编辑分组：进入 / 保存 / 取消", () => {
    const { api, fake } = setup();
    api.newGroupName.value = "原名";
    api.createNewGroup();
    const id = fake.groups[0]!.id;

    api.startEditGroup(id);
    expect(api.editingGroupId.value).toBe(id);
    expect(api.editingGroupName.value).toBe("原名");

    api.editingGroupName.value = "新名";
    api.editingGroupColor.value = "#000000";
    api.saveEditGroup();
    expect(fake.groups[0]!.name).toBe("新名");
    expect(api.editingGroupId.value).toBeNull();

    api.startEditGroup(id);
    api.cancelEditGroup();
    expect(api.editingGroupId.value).toBeNull();
  });

  it("编辑时名称为空给提示且不保存", () => {
    const { api, fake, message } = setup();
    api.newGroupName.value = "原名";
    api.createNewGroup();
    api.startEditGroup(fake.groups[0]!.id);
    api.editingGroupName.value = "   ";
    api.saveEditGroup();
    expect(message.warning).toHaveBeenCalledWith("请输入分组名称");
    expect(fake.groups[0]!.name).toBe("原名");
  });

  it("没有编辑目标时 saveEditGroup 直接返回", () => {
    const { api, fake } = setup();
    api.saveEditGroup();
    expect(fake.store.updateTokenGroup).not.toHaveBeenCalled();
  });

  it("切换分组选择会同步 selectedTokens", () => {
    const { api, fake, selectedTokens } = setup();
    api.newGroupName.value = "g";
    api.createNewGroup();
    const id = fake.groups[0]!.id;
    fake.store.addTokenToGroup(id, "t1");

    api.toggleGroupSelection(id);
    expect(api.isGroupSelected(id)).toBe(true);
    expect(selectedTokens.value).toEqual(["t1"]);

    api.toggleGroupSelection(id);
    expect(api.isGroupSelected(id)).toBe(false);
    expect(selectedTokens.value).toEqual([]);
  });

  it("多个分组的账号会合并去重", () => {
    const { api, fake, selectedTokens } = setup();
    api.newGroupName.value = "g1";
    api.createNewGroup();
    api.newGroupName.value = "g2";
    api.createNewGroup();
    const [g1, g2] = fake.groups;
    fake.store.addTokenToGroup(g1!.id, "t1");
    fake.store.addTokenToGroup(g2!.id, "t1");
    fake.store.addTokenToGroup(g2!.id, "t2");

    api.toggleGroupSelection(g1!.id);
    api.toggleGroupSelection(g2!.id);
    expect(selectedTokens.value.sort()).toEqual(["t1", "t2"]);
  });

  it("clearAllGroupSelection 清空选择与勾选", () => {
    const { api, fake, selectedTokens } = setup();
    api.newGroupName.value = "g";
    api.createNewGroup();
    api.toggleGroupSelection(fake.groups[0]!.id);
    api.clearAllGroupSelection();
    expect(api.selectedGroups.value).toEqual([]);
    expect(selectedTokens.value).toEqual([]);
  });

  it("增删账号给出成功提示", () => {
    const { api, fake, message } = setup();
    api.newGroupName.value = "g";
    api.createNewGroup();
    const id = fake.groups[0]!.id;
    api.addTokenToSelectedGroup(id, "t1");
    expect(message.success).toHaveBeenCalledWith("已将token添加到分组");
    api.removeTokenFromSelectedGroup(id, "t1");
    expect(message.success).toHaveBeenCalledWith("已将token从分组移除");
  });

  it("getValidGroupTokenIds 过滤掉已删除账号", () => {
    const { api, fake } = setup();
    api.newGroupName.value = "g";
    api.createNewGroup();
    const id = fake.groups[0]!.id;
    api.addTokenToSelectedGroup(id, "t1");
    expect(api.getValidGroupTokenIds(id)).toEqual(["t1"]);
    fake.removeToken("t1");
    expect(api.getValidGroupTokenIds(id)).toEqual([]);
  });

  it("色板是固定 8 色", () => {
    const { api } = setup();
    expect(api.groupColors).toHaveLength(8);
    expect(api.groupColors[0]).toBe("#1677ff");
  });
});
