import type { EVM, XyzwSession } from "./types.ts";
import { EventEmitter } from "event-emitter3";

import { gameLogger } from "@/utils/logger";
import { AckPlugin } from "./ack.ts";
import { ChatPlugin } from "./chat.ts";
import { HangupPlugin } from "./hangup.ts";
import { LegionPlugin } from "./legion.ts";
import { RolePlugin } from "./role.ts";
import { StudyPlugin } from "./study.ts";
import { TeamPlugin } from "./team.ts";
import { TowerPlugin } from "./tower.ts";

// 类型从 types.ts 再导出，保持既有 `from "./index"` 的导入方不受影响
export type { EVM, XyzwSession } from "./types.ts";

export const $emit = new EventEmitter();
export const events: Set<string> = new Set<string>();
$emit.on("$any", (cmd: string, data: XyzwSession) => {
  gameLogger.warn(`收到未处理事件: ${cmd} TokenID: ${data.tokenId}`, data);
});

export const onSome = (event: string[], listener: (...args: any[]) => void) => {
  event.map((e) => events.add(e));
  event.forEach((evt) => {
    $emit.on(evt, listener);
  });
};

export const emitPlus = (
  event: string | symbol,
  ...args: Array<any>
): boolean => {
  // 先触发具体事件，然后触发$any事件
  const result = $emit.emit(event, ...args);
  if (!events.has(event as string)) {
    $emit.emit("$any", event, ...args);
  }
  return result;
};

const evmInst: EVM = {
  onSome,
  emitPlus,
  $emit,
};

AckPlugin(evmInst);

RolePlugin(evmInst);

TeamPlugin(evmInst);

StudyPlugin(evmInst);

TowerPlugin(evmInst);

LegionPlugin(evmInst);

ChatPlugin(evmInst);

HangupPlugin(evmInst);
