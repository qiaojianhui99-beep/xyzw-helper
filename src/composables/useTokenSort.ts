/**
 * 账号列表排序（批量日常任务页）。
 *
 * 原先内联在 `views/BatchDailyTasks.vue`（约 80 行），逻辑本身与视图无关：
 * 排序配置存在 localStorage 的 tokenSortConfig 键里（与 TokenImport 页共享），
 * 切换字段时重置为升序。抽出来后可以单测，也便于其他页面复用同一套排序。
 */

import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";
import { storage } from "@/api/storage";

/** 可排序字段 */
export type TokenSortField = "name" | "server" | "createdAt" | "lastUsed";

/** 排序配置 */
export interface TokenSortConfig {
  field: TokenSortField;
  direction: "asc" | "desc";
}

/** 排序所需的 token 字段（结构子集，避免依赖 store 的完整类型） */
interface SortableToken {
  name?: string | null;
  server?: string | null;
  createdAt?: string | null;
  lastUsed?: string | null;
}

const STORAGE_KEY = "tokenSortConfig";
const DEFAULT_CONFIG: TokenSortConfig = { field: "createdAt", direction: "asc" };

/**
 * 从 localStorage 读取排序配置。
 * @returns 已保存的配置；没有或解析失败时返回默认值
 */
function readConfig(): TokenSortConfig {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.field && parsed.direction) {
      return parsed as TokenSortConfig;
    }
  } catch {
    // 脏数据：退回默认排序，不影响页面
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * 按配置取比较值。
 * @param token 账号
 * @param field 排序字段
 * @returns 可比较的值（字符串统一小写）
 */
function valueOf(token: SortableToken, field: TokenSortField): string | number {
  switch (field) {
    case "name":
      return token.name?.toLowerCase() ?? "";
    case "server":
      return token.server?.toLowerCase() ?? "";
    case "createdAt":
      return new Date(token.createdAt ?? 0).getTime();
    case "lastUsed":
      return new Date(token.lastUsed ?? 0).getTime();
    default:
      return token.name?.toLowerCase() ?? "";
  }
}

/**
 * 账号列表来源：响应式 ref、getter 或普通数组。
 *
 * Pinia 会把 store 里的 ref 自动解包成值，所以从 `tokenStore.gameTokens` 拿到的
 * 是数组本身而不是 Ref；传 getter 最稳，`() => tokenStore.gameTokens` 在 computed
 * 内求值同样能追踪依赖。
 */
export type TokenSource<T> = Ref<T[]> | (() => T[]) | T[];

/**
 * 账号列表排序状态与操作。
 * @param tokens 账号列表来源
 * @returns 排序配置、排序结果与交互方法
 */
export function useTokenSort<T extends SortableToken>(tokens: TokenSource<T>) {
  const sortConfig = ref<TokenSortConfig>(readConfig());

  /** 统一取值：getter / ref / 普通数组 */
  const list = computed<T[]>(() => {
    if (typeof tokens === "function") return (tokens as () => T[])() ?? [];
    if (isRef(tokens)) return tokens.value ?? [];
    return Array.isArray(tokens) ? tokens : [];
  });

  const sortedTokens = computed(() => {
    const { field, direction } = sortConfig.value;
    const factor = direction === "asc" ? 1 : -1;
    return [...list.value].sort((a, b) => {
      const va = valueOf(a, field);
      const vb = valueOf(b, field);
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  });

  /**
   * 切换排序字段或方向，并持久化。
   * @param field 被点击的字段
   */
  const toggleSort = (field: TokenSortField): void => {
    if (sortConfig.value.field === field) {
      sortConfig.value.direction = sortConfig.value.direction === "asc" ? "desc" : "asc";
    } else {
      sortConfig.value.field = field;
      sortConfig.value.direction = "asc";
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(sortConfig.value));
  };

  /**
   * @param field 列字段
   * @returns 当前列的排序箭头；非当前列返回 null
   */
  const getSortIcon = (field: TokenSortField): string | null => {
    if (sortConfig.value.field !== field) return null;
    return sortConfig.value.direction === "asc" ? "↑" : "↓";
  };

  return { sortConfig, sortedTokens, toggleSort, getSortIcon };
}
