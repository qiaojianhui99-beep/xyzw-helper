import type { EVM, XyzwSession } from ".";
import { usePersistentRef } from "@/composables/usePersistentRef";
import { gameLogger } from "@/utils/logger";

// 高频写入的实时缓存：只落本机镜像，不上云（见 api/storage.js 的 NEVER_SYNC）
const chatMsgList = usePersistentRef<Array<any>>("xyzw_chat_msg_list", []);

// 处理聊天消息事件，保存最新的聊天记录
export const ChatPlugin = ({ onSome }: EVM) => {
  onSome(
    ["system_newchatmessagenotify", "system_newchatmessagenotifyresp"],
    (data: XyzwSession) => {
      gameLogger.info(`收到新聊天消息事件: ${data.tokenId}`, data);
      const { body } = data;
      if (!body || !body.chatMessage) {
        gameLogger.debug("聊天消息响应为空或格式不正确");
        return;
      }
      chatMsgList.value.push(body.chatMessage);
      while (chatMsgList.value.length > 100) {
        chatMsgList.value.shift();
      }
    },
  );
};
