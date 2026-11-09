import { ref } from "vue";

// 兼容层：这些导出被 architecture.contract.json 冻结，改名/删除会触发契约违规。
// gameTokens 与 stores/tokenStore.ts 指向同一个键、同一个 facade，不再是两条通道。
export { gameTokens } from "@/stores/tokenStore";

export const wsConnections = ref({}); // WebSocket连接状态
export const connectionLocks = ref(new Map()); // 连接操作锁，防止竞态条件
export const activeConnections = ref(new Map()); // 跨标签页连接协调

// Token管理
