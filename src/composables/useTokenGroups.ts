/**
 * 账号分组管理（批量日常任务页）。
 *
 * 原先的状态（9 个 ref + 颜色表）与操作（约 160 行）内联在
 * `views/BatchDailyTasks.vue`。抽出来时把 store 方法与响应式数据都注入进来，
 * composable 自己不知道 Pinia 的存在 —— 也就不会再踩「store 属性被解包」的坑。
 */

import type { Ref } from "vue";
import { ref } from "vue";

/** 分组 */
export interface TokenGroup {
  id: string;
  name: string;
  color: string;
  tokenIds?: string[];
}

/** 注入依赖 */
export interface TokenGroupDeps {
  /** 全部分组 */
  tokenGroups: Ref<TokenGroup[]>;
  /** 当前勾选的账号 id（分组选择会写这里） */
  selectedTokens: Ref<string[]>;
  /** 排序后的账号（新建分组时「全选」用） */
  sortedTokens: Ref<Array<{ id: string }>>;
  message: {
    success: (msg: string) => void;
    warning: (msg: string) => void;
  };
  store: {
    createTokenGroup: (name: string, color: string) => TokenGroup;
    updateTokenGroup: (id: string, patch: { name?: string; color?: string }) => void;
    deleteTokenGroup: (id: string) => void;
    addTokenToGroup: (id: string, tokenId: string) => void;
    removeTokenFromGroup: (id: string, tokenId: string) => void;
    getValidGroupTokenIds: (id: string) => string[];
  };
}

/** 可选颜色（分组管理界面的色板） */
const GROUP_COLORS = [
  "#1677ff", // 蓝色
  "#52c41a", // 绿色
  "#faad14", // 橙色
  "#f5222d", // 红色
  "#722ed1", // 紫色
  "#13c2c2", // 青色
  "#eb2f96", // 粉色
  "#fa8c16", // 赤红色
];

/**
 * 分组管理状态与操作。
 * @param deps 注入依赖
 * @returns 状态、色板与全部操作
 */
export function useTokenGroups(deps: TokenGroupDeps) {
  const showGroupManageModal = ref(false);
  const selectedGroups = ref<string[]>([]);
  const newGroupName = ref("");
  const newGroupColor = ref("#1677ff");
  const newGroupSelectedTokens = ref<string[]>([]);
  const editingGroupId = ref<string | null>(null);
  const editingGroupName = ref("");
  const editingGroupColor = ref("");
  /** 定时任务里通过分组按钮选中的分组 */
  const taskScheduleSelectedGroupIds = ref<string[]>([]);
  const groupColors = GROUP_COLORS;

  /** 根据已选分组同步勾选账号 */
  const updateSelectedTokensFromGroups = (): void => {
    const tokenIds = new Set<string>();
    for (const groupId of selectedGroups.value) {
      for (const id of deps.store.getValidGroupTokenIds(groupId)) tokenIds.add(id);
    }
    deps.selectedTokens.value = Array.from(tokenIds);
  };

  /** 创建分组（可带一批账号） */
  const createNewGroup = (): void => {
    if (!newGroupName.value.trim()) {
      deps.message.warning("请输入分组名称");
      return;
    }
    const group = deps.store.createTokenGroup(
      newGroupName.value.trim(),
      newGroupColor.value,
    );
    for (const tokenId of newGroupSelectedTokens.value) {
      deps.store.addTokenToGroup(group.id, tokenId);
    }
    deps.message.success("分组创建成功");
    newGroupName.value = "";
    newGroupColor.value = "#1677ff";
    newGroupSelectedTokens.value = [];
  };

  /** 新建分组时全选当前排序后的账号 */
  const selectAllNewGroup = (): void => {
    newGroupSelectedTokens.value = deps.sortedTokens.value.map((t) => t.id);
  };

  /** 新建分组时取消全选 */
  const deselectAllNewGroup = (): void => {
    newGroupSelectedTokens.value = [];
  };

  /**
   * 删除分组（分组内的 token 不受影响）。
   * @param groupId 分组 id
   */
  const deleteGroup = (groupId: string): void => {
    // eslint-disable-next-line no-alert -- 保留既有的原生确认交互
    if (confirm("确定要删除这个分组吗？分组中的token不会被删除。")) {
      deps.store.deleteTokenGroup(groupId);
      deps.message.success("分组已删除");
    }
  };

  /** 保存分组编辑 */
  const saveEditGroup = (): void => {
    if (!editingGroupId.value) return;
    if (!editingGroupName.value.trim()) {
      deps.message.warning("请输入分组名称");
      return;
    }
    deps.store.updateTokenGroup(editingGroupId.value, {
      name: editingGroupName.value.trim(),
      color: editingGroupColor.value,
    });
    deps.message.success("分组已更新");
    editingGroupId.value = null;
    editingGroupName.value = "";
    editingGroupColor.value = "";
  };

  /**
   * 进入编辑态。
   * @param groupId 分组 id
   */
  const startEditGroup = (groupId: string): void => {
    const group = deps.tokenGroups.value.find((g) => g.id === groupId);
    if (group) {
      editingGroupId.value = groupId;
      editingGroupName.value = group.name;
      editingGroupColor.value = group.color;
    }
  };

  /** 退出编辑态 */
  const cancelEditGroup = (): void => {
    editingGroupId.value = null;
    editingGroupName.value = "";
    editingGroupColor.value = "";
  };

  /**
   * 切换分组选择，并同步勾选账号。
   * @param groupId 分组 id
   */
  const toggleGroupSelection = (groupId: string): void => {
    const index = selectedGroups.value.indexOf(groupId);
    if (index > -1) {
      selectedGroups.value.splice(index, 1);
    } else {
      selectedGroups.value.push(groupId);
    }
    updateSelectedTokensFromGroups();
  };

  /**
   * @param groupId 分组 id
   * @returns 该分组是否被选中
   */
  const isGroupSelected = (groupId: string): boolean =>
    selectedGroups.value.includes(groupId);

  /** 清空全部分组选择与勾选 */
  const clearAllGroupSelection = (): void => {
    selectedGroups.value = [];
    deps.selectedTokens.value = [];
  };

  /**
   * 添加账号到分组。
   * @param groupId 分组 id
   * @param tokenId 账号 id
   */
  const addTokenToSelectedGroup = (groupId: string, tokenId: string): void => {
    deps.store.addTokenToGroup(groupId, tokenId);
    deps.message.success("已将token添加到分组");
  };

  /**
   * 从分组移除账号。
   * @param groupId 分组 id
   * @param tokenId 账号 id
   */
  const removeTokenFromSelectedGroup = (groupId: string, tokenId: string): void => {
    deps.store.removeTokenFromGroup(groupId, tokenId);
    deps.message.success("已将token从分组移除");
  };

  /**
   * @param groupId 分组 id
   * @returns 该分组内仍然存在的账号 id
   */
  const getValidGroupTokenIds = (groupId: string): string[] =>
    deps.store.getValidGroupTokenIds(groupId);

  return {
    showGroupManageModal,
    selectedGroups,
    newGroupName,
    newGroupColor,
    newGroupSelectedTokens,
    editingGroupId,
    editingGroupName,
    editingGroupColor,
    taskScheduleSelectedGroupIds,
    groupColors,
    createNewGroup,
    selectAllNewGroup,
    deselectAllNewGroup,
    deleteGroup,
    saveEditGroup,
    startEditGroup,
    cancelEditGroup,
    toggleGroupSelection,
    isGroupSelected,
    updateSelectedTokensFromGroups,
    clearAllGroupSelection,
    addTokenToSelectedGroup,
    removeTokenFromSelectedGroup,
    getValidGroupTokenIds,
  };
}
