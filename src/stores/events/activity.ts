import type { EVM, XyzwSession } from "./types.ts";
import { gameLogger } from "@/utils/logger";

/**
 * 活动信息推送（activity_get / activity_getresp）。
 *
 * ⚠️ 尚未在 index.ts 注册 —— 见 index.ts 里「未装配插件」的说明。
 */
export const ActivityPlugin = ({ onSome }: EVM) => {
  onSome(["activity_getresp", "activity_get"], (data: XyzwSession) => {
    gameLogger.verbose(`收到活动信息事件: ${data.tokenId}`, data);
    const { body } = data;
    gameLogger.debug("活动信息body:", body);
    if (!body) {
      gameLogger.debug("活动信息响应为空");
      return;
    }
    // 假设 activity_get 返回的 body 就是活动信息对象，或者包含 activities 字段
    // 如果 body 是数组，可能需要转换。这里先按原样存储，后续根据实际数据调整
    data.gameData.value.commonActivityInfo = body;
    data.gameData.value.lastUpdated = new Date().toISOString();
  });
};
