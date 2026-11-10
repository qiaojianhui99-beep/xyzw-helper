import type { EventEmitter } from "event-emitter3";
import type { XyzwWebSocketClient } from "@/utils/xyzwWebSocket";

/**
 * 服务端推送的统一信封。
 *
 * 单独放这个文件，是为了避免「index.ts 聚合插件、插件又从 index.ts 取类型」
 * 形成的类型层循环依赖。插件请从这里取类型。
 */
export interface XyzwSession {
  id: string;
  tokenId: string;
  cmd: string;
  token: any;
  body: any;
  client: XyzwWebSocketClient | null;
  gameData: any;
}

/** 插件装配上下文 */
export interface EVM {
  onSome: (event: string[], listener: (...args: any[]) => void) => void;
  emitPlus: (event: string | symbol, ...args: Array<any>) => boolean;
  $emit: EventEmitter;
}
