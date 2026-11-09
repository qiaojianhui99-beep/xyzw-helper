# CLAUDE.md

> **本文只是入口指针，不再维护 API 清单。**
> 2026-11 起项目文档收口为「单一真相源」，理由见文末「为什么砍掉旧版」。

## 先读（顺序固定，共 4 份）

| # | 文件 | 内容 |
|---|---|---|
| 1 | [`AGENTS.md`](AGENTS.md) | 三条硬规则、常用命令、落点表、已知雷区 |
| 2 | [`docs/PROJECT-OVERVIEW.md`](docs/PROJECT-OVERVIEW.md) | 全景：目录、数据流、Token/连接/协议契约、路由表、文档勘误 |
| 3 | [`docs/OPEN-CLOSED-RULES.md`](docs/OPEN-CLOSED-RULES.md) | 扩展点在哪、什么绝对不能改、破坏性变更流程、目录职责 |
| 4 | [`docs/BACKEND.md`](docs/BACKEND.md) | 后端（Fastify + Postgres）结构、API、加密、对拍机制 |

改界面另读 [`design-system/xyzw-console/MASTER.md`](design-system/xyzw-console/MASTER.md)。
改完验什么： [`docs/REGRESSION-CHECKLIST.md`](docs/REGRESSION-CHECKLIST.md)。

## 四条不可协商的约定（2026-11 新增）

1. **存储只有一个写入者**：业务代码访问持久化一律走 `src/api/storage.js` 的 `storage`；
   需要响应式时用 `src/composables/usePersistentRef.ts`。**不要再用 VueUse 的
   `useLocalStorage`、也不要直调 `window.localStorage`** —— 两条通道并存时镜像读不到直写，
   云同步会静默失效（`test/storageChannel.test.js` 守这条）。
2. **协议实现要单源**：`src/utils/bonProtocol.js` 是主实现，
   `backend/src/protocol/bonProtocol.js` 是历史副本。改任何一侧都必须让
   `test/protocolParity.test.js` 保持全绿；长期目标是抽共享包后删掉副本。
3. **契约用 strict 跑**：提交与 CI 都跑 `node scripts/check-architecture.mjs --strict`。
   **新增**路由/存储键/导出/代理前缀也要先 `--update` 固化，否则闸门红。
4. **后端在闸门内**：`npm run lint` 覆盖 `backend/`；后端测试在 CI 里起 Postgres 跑，
   本地等价命令是 `node scripts/verify-all.mjs`。

## 常用命令

```bash
npm run dev              # 开发服务器 http://localhost:3000
node scripts/verify-all.mjs      # 本地等价 CI（契约→lint→单测→构建→后端单测）
node scripts/verify-all.mjs --fast   # 只做契约 + lint + 前端单测
npm run verify           # 契约(--strict) + lint + 前端单测
npm run verify:full      # 再加生产构建与产物预算
npm run test:backend     # 后端 73 个测试（需 pnpm db:up）
npm run db:up            # 本地 Postgres :55432
```

## 为什么砍掉旧版

旧版 CLAUDE.md 有 33KB，其中大量 API 描述已与代码脱节（`connectWebSocket`、
`queuedTokens`、`maxActive=10`、`refreshToken` 等均不存在），而 `AGENTS.md` 与
`docs/PROJECT-OVERVIEW.md` 又各写了一遍。三份文档互相矛盾时，读的人只能靠猜。

现在：**流程写在 AGENTS.md，事实写进 docs/，本文只做导航**。修改任何一份时不需要
同步另外两份 —— 这是刻意的取舍，不是遗漏。
