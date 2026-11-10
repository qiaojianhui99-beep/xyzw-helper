/**
 * 月赛助威（War Guess）弹窗：排行榜拉取、俱乐部选择、助威下发。
 *
 * 原先内联在 `views/BatchDailyTasks.vue`（约 140 行）。抽出来时把外部依赖
 * 显式注入，而不是让 composable 去 import store —— 这样它不依赖 Pinia 的
 * 初始化时序，也避免再次出现「store 属性被解包成普通值」那类隐性 bug。
 */

import type { Ref } from "vue";
import { h, ref } from "vue";
import { formatPower } from "@/utils/batch/activityWindows.js";

/** 排行榜条目 */
export interface WarGuessRow {
  id: string | number;
  logo?: string;
  serverId?: string | number;
  name?: string;
  power?: number;
  quenchNum?: number;
  guessNum?: number;
  totalNum?: number;
}

/** 日志条目 */
export interface BatchLogEntry {
  time: string;
  message: string;
  type: "info" | "error" | "success" | string;
}

/** 最小账号结构 */
interface TokenLike {
  id: string;
  name?: string;
  token: string;
  wsUrl?: string | null;
}

/** 注入依赖：全部由视图提供，composable 不直接触碰 store */
export interface WarGuessDeps {
  /** 已勾选的账号 id */
  selectedTokens: Ref<string[]>;
  /** 全量账号（用于按 id 找 token） */
  tokens: Ref<TokenLike[]>;
  /** 取连接状态 */
  getWebSocketStatus: (tokenId: string) => string;
  /** 建立连接（fire-and-forget） */
  createWebSocketConnection: (
    tokenId: string,
    token: string,
    wsUrl?: string | null,
  ) => unknown;
  /** 发送带响应超时的命令 */
  sendMessageWithPromise: (
    tokenId: string,
    cmd: string,
    params: Record<string, unknown>,
    timeout: number,
  ) => Promise<{ list?: WarGuessRow[] | Record<string, WarGuessRow> } | null | undefined>;
  /** 面板提示 */
  message: {
    warning: (msg: string) => void;
    error: (msg: string) => void;
  };
  /** 执行日志 */
  addLog: (entry: BatchLogEntry) => void;
  /** 助威下发（批量） */
  batchWarGuessCheer: (legionId: string | number, coin: number) => Promise<void>;
}

/**
 * 月赛助威弹窗的完整状态与操作。
 * @param deps 外部依赖
 * @returns 弹窗状态、表格配置与操作方法
 */
export function useWarGuess(deps: WarGuessDeps) {
  const showWarGuessModal = ref(false);
  const warGuessList = ref<WarGuessRow[]>([]);
  const warGuessLoading = ref(false);
  const warGuessCoin = ref(20);
  const selectedWarGuessLegionId = ref<string | number | null>(null);

  /** 排行榜表格列（含头像与战力渲染） */
  const warGuessColumns = [
    { type: "selection", multiple: false },
    { title: "ID", key: "id", width: 100 },
    {
      title: "头像",
      key: "logo",
      render(row: WarGuessRow) {
        return h("img", {
          src: row.logo,
          style: { width: "30px", height: "30px", borderRadius: "50%" },
        });
      },
      width: 60,
    },
    { title: "区服", key: "serverId", width: 80 },
    { title: "俱乐部", key: "name", width: 120 },
    {
      title: "战力",
      key: "power",
      render(row: WarGuessRow) {
        return formatPower(row.power);
      },
      width: 100,
    },
    { title: "红淬", key: "quenchNum" },
    { title: "已助威", key: "guessNum" },
    {
      title: "总热度",
      key: "totalNum",
      render(row: WarGuessRow) {
        return formatPower(row.totalNum || 0);
      },
      width: 100,
    },
  ];

  /**
   * 行点击选中。
   * @param row 行数据
   * @returns 传给表格的 row-props
   */
  const warGuessRowProps = (row: WarGuessRow) => ({
    style: "cursor: pointer",
    onClick: () => {
      selectedWarGuessLegionId.value = row.id;
    },
  });

  /** 拉取排行榜（用第一个勾选账号的连接） */
  const fetchWarGuessRank = async (): Promise<void> => {
    if (deps.selectedTokens.value.length === 0) {
      deps.message.warning("请先选择一个账号用于获取月赛助威数据");
      return;
    }

    const tokenId = deps.selectedTokens.value[0];
    if (!tokenId) {
      deps.message.warning("请先选择一个账号用于获取月赛助威数据");
      return;
    }
    const token = deps.tokens.value.find((t) => t.id === tokenId);
    if (!token) {
      deps.message.warning("未找到对应账号信息");
      return;
    }

    warGuessLoading.value = true;
    try {
      deps.addLog({
        time: new Date().toLocaleTimeString(),
        message: `正在使用 ${token.name} 获取月赛助威数据...`,
        type: "info",
      });

      // 保证连接可用
      const status = deps.getWebSocketStatus(tokenId);
      if (status !== "connected") {
        deps.createWebSocketConnection(tokenId, token.token, token.wsUrl);
        await new Promise((r) => setTimeout(r, 2000));
      }

      const res = await deps.sendMessageWithPromise(
        tokenId,
        "warguess_getrank",
        { bfId: "" },
        5000,
      );

      if (res && res.list) {
        const raw = res.list;
        const list = Array.isArray(raw) ? raw : Object.values(raw);
        // 按总热度倒序，只展示前 20
        warGuessList.value = [...list]
          .sort((a, b) => (b.totalNum || 0) - (a.totalNum || 0))
          .slice(0, 20);
      } else {
        deps.message.warning("获取月赛助威数据为空");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      deps.message.error(`获取月赛助威数据失败: ${msg}`);
      deps.addLog({
        time: new Date().toLocaleTimeString(),
        message: `获取月赛助威数据失败: ${msg}`,
        type: "error",
      });
    } finally {
      warGuessLoading.value = false;
    }
  };

  /** 打开弹窗：重置选择；已勾选账号时自动拉榜 */
  const openWarGuessModal = (): void => {
    showWarGuessModal.value = true;
    selectedWarGuessLegionId.value = null;
    warGuessList.value = [];
    if (deps.selectedTokens.value.length > 0) {
      void fetchWarGuessRank();
    }
  };

  /** 确认助威：关闭弹窗并下发 */
  const handleWarGuessCheer = async (): Promise<void> => {
    if (!selectedWarGuessLegionId.value) {
      deps.message.warning("请先选择一个俱乐部");
      return;
    }
    showWarGuessModal.value = false;
    await deps.batchWarGuessCheer(
      selectedWarGuessLegionId.value,
      warGuessCoin.value,
    );
  };

  return {
    showWarGuessModal,
    warGuessList,
    warGuessLoading,
    warGuessCoin,
    selectedWarGuessLegionId,
    warGuessColumns,
    warGuessRowProps,
    openWarGuessModal,
    fetchWarGuessRank,
    handleWarGuessCheer,
  };
}
