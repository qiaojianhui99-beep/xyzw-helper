// 兼容层：实现已移到 `src/utils/cache.ts`（它从来不是 Pinia store）。
// 这里保留显式 re-export，因为 architecture.contract.json 冻结了这些导出名；
// 新增代码请直接从 `@/utils/cache` 引入。
export {
  $CacheManager,
  Cache,
  CacheManager,
  Content,
  install,
} from "@/utils/cache";
