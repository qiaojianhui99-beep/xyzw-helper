# 开闭原则落地规范：只许加，不许悄悄改

> 一句话：**新功能靠新增文件和新增注册项完成；旧功能的形状（路由、键名、命令、导出、默认值、报文格式）一律当成对外契约，要动就走变更流程。**

这不是口号，本文第 7 节有可执行机器校验（`npm run verify`），违反就直接红。

---

## 1. 什么算「契约」

契约 = 已经对外承诺、改了就有人受影响的东西。本项目的契约清单（全部已写进 `architecture.contract.json`）：

| # | 契约 | 存在形式 | 破坏后的后果 |
|---|---|---|---|
| 1 | 路由 `path` / `name` | `src/router/index.js` | 书签、外链、`/tokens?token=` 回调、分享链接全失效 |
| 2 | `views/*.vue` 文件 | 文件式路由自动扫描 | 页面 404 |
| 3 | 受保护路由数量 | `meta.requiresToken: true` | 未登录也能进后台 |
| 4 | `localStorage` 键名 | 30 个键 | 老用户 Token/设置全部丢失，等于清号 |
| 5 | `tokenStore` 公开方法 | `return { ... }` 出口 | 所有页面的调用点炸 |
| 6 | utils 模块导出符号 | `export class/function/const` | 跨模块 import 失败 |
| 7 | 游戏命令名 + 默认 body | `registerDefaultCommands` | 发出的报文变了，服端返回错误 |
| 8 | BON 编解码字节格式 | `bonProtocol.js` | 全服通信失效（最致命） |
| 9 | 代理前缀 | `vite.config.js` `proxy` | 登录/扫码接口 404 |
| 10 | 批量默认参数 | `batch/constants.js` | 全部用户的并发/超时行为被悄悄改掉 |
| 11 | `package.json` 脚本与依赖 | 脚本 + dependencies | 工程跑不起来 / 依赖消失 |
| 12 | 既有测试断言 | `test/*.test.js` | 删测试 = 拆掉安全网 |

---

## 2. 三色规则

### 🟢 绿色：随时可以加（扩展）

- 新增 `src/views/XxxPage.vue`
- 新增 `src/components/{业务}/XxxCard.vue`
- 新增 `src/utils/xxx.js`（独立模块，不碰既有模块内部）
- 新增 `src/utils/batch/tasksXxx.js`
- 新增 `src/stores/events/xxx.ts` 事件插件
- 新增 `registerDefaultCommands` 里的一条 `.register(...)`
- 新增 `GameMessages` 模板
- 新增 `vite.config.js` 里一条代理前缀
- 新增 `localStorage` 键（**新前缀**，不修改旧键语义）
- 新增测试文件 `test/xxx.test.js`
- 新增文档

### 🟡 黄色：可以做，但必须走变更流程（第 5 节）

- 给既有函数**加可选参数**（尾部追加，有默认值）
- 给既有 store **新增**方法（不删不改旧方法）
- 给既有组件**新增** props（带默认值）/ emits
- 修改既有命令的**可选**字段（且服务端兼容）
- 调整默认参数值（必须写进变更记录 + 同步契约基线）
- 提升依赖大版本

### 🔴 红色：不要做（真要做就是破坏性变更，需单独评审）

- 删/改路由 `path` 或 `name`
- 删/改 `localStorage` 键名或语义
- 删/改 `tokenStore` 既有方法名、参数顺序、返回结构
- 删/改 utils 既有导出名
- 改 BON 编解码逻辑、`ProtoMsg` 字段顺序、加密算法标识
- 改既有命令的默认 body 字段
- 改 `batch/constants.js` 里默认并发/延迟
- 删测试、跳过测试、`test.skip`
- 用 `// eslint-disable` 掩盖新问题（既有豁免除外）
- 直接改 `src/xyzw/**`、`public/game/**`、`public/{box,fish,team,icons}/**`（第三方游戏产物）

---

## 3. 扩展点清单（该往哪加）

| 想加的东西 | 加在哪 | 必做配套 | 对应测试 |
|---|---|---|---|
| 页面 | `src/views/Name.vue` + `router/index.js` 加一条 | 设 `meta.title` / `requiresToken` | 契约测试自动收录 `views` |
| 后台子页 | `src/views/Name.vue` + `/admin` 的 `children` | 同上 | 同上 |
| 业务组件 | `src/components/<域>/Name.vue` | 自动注册，无需 import | — |
| 游戏命令 | `registerDefaultCommands` 一条 `.register` | 需要编码体就 `{ rawBody: true }` | `test/bonProtocol.test.js` / 新测试 |
| 报文模板 | `GameMessages` 加字段 | 与命令配套 | 同上 |
| 单账号任务 | `src/utils/<name>Runner.js` 或 `dailyTaskRunner` 里加独立步骤 | 步骤要幂等、可重试 | 对应 `*.test.js` |
| 批量任务 | `src/utils/batch/tasksXxx.js` + 注册表 + `defaultTemplate` 默认值 | 失败要写日志、不阻断其他账号 | `test/batchDailyRun.test.js` |
| 定时任务 | 显式注册表加一项（**不要 eval**） | 处理未知 id 的兜底 | `test/scheduledTaskRegistry.test.js` |
| 服务端推送 | `src/stores/events/xxx.ts` + `index.ts` 注册 | 未匹配事件仍走 `$any` | 新测试 |
| 登录代理 | `vite.config.js` `proxy` 加一条 | 前缀新起，不要改旧的 | 契约测试收录 `proxyPrefixes` |
| 本地状态 | `useLocalStorage("newKey", …)` | 键名带业务前缀 | 契约测试收录 `storageKeys` |

---

## 4. 标准流程：加一个游戏功能

按顺序做，别跳步（顺序本身就是为了不破坏旧功能）：

1. **写清楚边界**：这个功能是「读状态」还是「写状态」还是「先配置再执行」？配置和执行**必须解耦**（黑市采购那次的教训：错误耦合导致第一版返工）。
2. **确认协议**：命令名、请求体结构、是否需要 BON 编码、是否有响应 ack。结论写进 `docs/feature-protocol-dev-guide.md` 同风格的小节。
3. **先加命令**：`registerDefaultCommands` 里 `.register("xxx_cmd", {…默认字段})`。**新命令，不改老命令。**
4. **先写测试**：新命令的构造报文断言（字段、编码类型、`rawBody` 行为）。跑 `npm test` 看到红 → 实现 → 看到绿。
5. **接业务**：任务函数（单账号）或 `batch/tasksXxx.js`（跨账号），提供 `onLog` / `onProgress` 回调，异常要吞掉并记日志，不能中断整轮。
6. **接 UI**：新页面或新卡片。复用 `components/Common`、`cards` 里的既有样式，别复制粘贴大段 CSS。
7. **固化契约**：`npm run update:arch`（只并入新增项），然后 `npm run verify`。
8. **补文档**：`PROJECT-OVERVIEW.md` 的第 4/6 节如果是新领域就补一段；协议细节补进 `feature-protocol-dev-guide.md`。

---

## 5. 变更流程：不得不动旧东西时

比如必须给 `sendMessageWithPromise` 加一个 `options` 参数，或者必须调整 `maxActive` 默认值。

1. **先证明必要**：能否用「新函数包旧函数」绕开？优先封装，不改签名。
2. **先加测试**：把「旧行为」写成测试（如果还没有），确认绿。
3. **再做改动**：尾部追加可选参数 / 新增方法 / 新增字段，保证旧调用点零改动。
4. **同步基线**：`node scripts/check-architecture.mjs --update`（纯新增会自动并入）。若确实要删/改，必须 `--update --allow-removals`，并在下面的表格里登记。
5. **登记变更**（本文件末尾「变更记录」表）：日期 / 变更点 / 原因 / 影响面 / 谁验证的。
6. **跑全量**：`npm run verify:full`（含构建）。

### 变更记录

| 日期 | 变更点 | 原因 | 影响面 | 验证 |
|---|---|---|---|---|
| 2026-10-25 | 新增 `scripts/check-architecture.mjs`、`test/architectureContract.test.js`、`check:arch`/`update:arch`/`verify`/`verify:full` 脚本 | 建立回归护栏 | 只增不改，运行时行为零变化 | `npm run verify` 全绿；`npm run build` 成功 |
| 2026-10-25 | 修正 `tokenStore.ts` 两处 JSDoc（`waitForLiveConnection` / `sendMessageWithPromise`） | lint `--max-warnings 0` 因 `@param` 不匹配而失败 | 纯注释，无逻辑变化 | `npm run lint` 0 warning；`npm test` 120 通过 |
| 2026-11-09 | 存储单通道：`tokenStore.ts` 的 6 个键、`stores/common.ts`、`stores/events/chat.ts` 全部从 `useLocalStorage` 迁到 `usePersistentRef`（新文件 `src/composables/usePersistentRef.ts`）；`src/api/storage.js` 增加订阅广播、按 `updatedAt` 的合并、内部写入时间戳键 `__storageLastWriteAt` | 两套写入通道导致镜像读不到 VueUse 直写，云同步在最核心的键（`gameTokens`）上静默失效 | 键名与序列化格式不变，存量数据无需迁移；`storage.length/key/snapshot` 不再暴露内部元数据键 | `test/storageChannel.test.js` 23 例、`test/storage.test.js` 全绿；`npm run verify` 220 测试通过 |
| 2026-11-09 | 协议单源门禁：新增 `test/protocolParity.test.js`（明文字节一致 + 三通道密文互通 + 记录后端副本缺失 `ProtoMsgLegion`/`GameMessages`） | 后端协议层是 `render-backend/lib/bonProtocol.js` 的原样拷贝（MD5 相同），已落后前端 254 行，无任何测试能发现 | 只增测试，不改实现 | 24 例全绿 |
| 2026-11-09 | 契约校验升级：`check-architecture.mjs` 新增 `--strict`（新增项也算失败）、`CURATED_FILES`/`EXPORT_MODULES` 纳入 `src/api/*`、`usePersistentRef.ts` 与后端关键文件、`storageKeys` 扫描补 `usePersistentRef`；基线固化 7 项（2 个存储键 + 5 条 `/api/*` 代理） | 默认模式只拦删除，新增永远静默通过，基线一路落后于代码（实测落后 5 条代理前缀） | 校验更严；`npm run verify` 已切到 `--strict` | `node scripts/check-architecture.mjs --strict` 通过 |
| 2026-11-09 | 后端迁入工作区：新增 `pnpm-workspace.yaml`（`.` + `backend`），删除 `backend/pnpm-lock.yaml`；`lint`/`format` 覆盖 `backend/`；新增 `scripts/verify-all.mjs` 与 `.github/workflows/verify.yml` | 后端 5936 行新增代码完全在闸门之外；CI 文件放在 `docs/ci/` 导致**从未真正运行** | 安装入口统一为根 `pnpm install`；`backend/` 开始接受零警告 lint | `pnpm install`（2 projects）、`npm run test:backend` 73 通过、`npm run lint` 通过 |
| 2026-11-09 | `backend` 的 `/api/storage/all` 与 `/api/storage/:key` 响应改为 `{ value, updatedAt }` | 没有时间戳，前端只能二选一（覆盖=丢本地写入，保留=永远收不到别的设备更新） | 前端已兼容新旧两种形状；后端测试断言同步更新 | 后端 73 测试通过 |

---

## 6. 反模式清单（都是真实踩过的坑）

| 反模式 | 为什么会发生 | 正确做法 |
|---|---|---|
| 把「配置」和「执行」写进同一个按钮 | 想省一步操作 | 两个命令、两个入口，配置只写状态 |
| 往 `send()` 里塞普通对象 | 忘了该命令要 BON 编码 | 用 `register(..., { rawBody: true })` 或先 `bon.encode` |
| 为了让新页面跑通，改 `router/index.js` 里老路由的 path | 路径冲突图省事 | 加新 path；老 path 保留（必要时做重定向） |
| 改 `localStorage` 键名「顺手规范一下」 | 觉得旧名难看 | 新增键 + 写迁移读取逻辑（读旧→写新→保留旧只读） |
| 调整 `maxActive` 默认值「让批量更快」 | 本地测试很顺 | 改的是**用户设置默认值**，必须登记变更；或让用户自己调，不改默认 |
| 删掉看起来没用的导出 | 以为是死代码 | 先 `grep` 全仓调用点；动态引用（`stores` 出口、事件名）grep 不到也要保留 |
| 为了让 lint 过而 `// eslint-disable-next-line` | 赶时间 | 修代码；确属误报再局部豁免并写原因 |
| 只跑 `npm run dev` 看一眼就提交 | 页面能开 | 页面能开 ≠ 逻辑没坏，必须 `npm run verify` |

---

## 7. 护栏机制（怎么保证「以后不会改坏」）

三层，从快到慢：

### 7.1 架构契约（秒级）

```bash
npm run check:arch     # 校验
npm run update:arch    # 只并入新增项
node scripts/check-architecture.mjs --update --allow-removals   # 显式承认删除（慎用）
```

`scripts/check-architecture.mjs` 会重新抽取当前工程事实，与 `architecture.contract.json` 逐条比对：

- 基线有、现在没有 → **违规**，退出码 1，并打印文件名/条目
- 现在有、基线没有 → 视为新增，允许（提示你 `--update`）
- 默认参数值变化 → **违规**
- 受保护路由变少 → **违规**

覆盖：关键文件存在性、utils/store 导出符号、路由 path/name、`views/*.vue`、`batch/tasks*.js`、`localStorage` 键、代理前缀、npm 脚本、依赖清单、批量默认参数。

### 7.2 单元测试（秒级）

`test/architectureContract.test.js` 把上面的校验接进 `npm test`，并额外守住两件事：

- 抽取器本身不能「什么都没抽到」（防假通过：断言路由/页面/键/模块的数量下限）
- 比对器必须真的能报错（用合成数据断言能识别删路由、删导出、改默认值）

所以就算有人把 `architecture.contract.json` 清空，测试也会红。

### 7.3 全量闸门（分钟级）

```bash
npm run verify        # 契约 + lint(0 warning) + 全部单测
npm run verify:full   # 再加生产构建
```

**提交前必须绿。** CI 没有的时候，这条就是 CI。

---

## 8. 提交前自检（照着打勾）

- [ ] 只新增了文件/注册项，没动第 1 节表格里的任何一行？
- [ ] 如果动了：是否在「变更记录」登记，并跑过 `--update`？
- [ ] 新功能有测试，且测试断言的是**行为**不是实现细节？
- [ ] `npm run verify` 全绿？
- [ ] `npm run verify:full` 能构建出 `dist/`（涉及构建配置时必跑）？
- [ ] 手测清单里对应的行过了一遍（见 `docs/REGRESSION-CHECKLIST.md`）？
- [ ] 没有新增 `eslint-disable`、没有 `test.skip`？
- [ ] 没有改动 `src/xyzw/**`、`public/game/**`？

---

## 9. 目录职责（2026-11 收口）

新增代码按这张表对号入座；放错目录视为规范问题，评审时直接打回。

| 目录 | 职责 | 不该出现 |
|---|---|---|
| `src/api/` | 后端 HTTP 客户端、存储门面与同步逻辑 | 业务状态、组件 |
| `src/utils/` | 无状态纯逻辑（协议、计算、格式化） | 直接读写持久化、UI 依赖 |
| `src/stores/` | Pinia 状态与跨组件协调 | 直接调 `fetch` |
| `src/composables/` | 可复用的响应式组合函数 | 协议编解码 |
| `src/components/` | 业务组件（按域分目录） | 全局单例 |
| `backend/src/api/` | Fastify 装配与路由 | 领域逻辑、SQL 拼接 |
| `backend/src/domain/` | 领域服务（唯一拿到 Token 明文的地方） | HTTP/DB 细节 |
| `backend/src/infra/` | db / crypto / logger / SQL 白名单 | 业务判断 |
| `backend/src/worker/` | cron 调度与任务编排 | 路由 |

### 9.1 三条新增红线

1. **持久化只能经 `src/api/storage.js` 写入**。新增 `useLocalStorage` 或
   `window.localStorage` 直调 = 红色（会让云同步静默失效）。响应式场景用
   `usePersistentRef`。门禁：`test/storageChannel.test.js`。
2. **改 BON 协议必须两侧同步**。`src/utils/bonProtocol.js` 与
   `backend/src/protocol/bonProtocol.js` 是两份实现，改一侧不改另一侧 = 红色。
   门禁：`test/protocolParity.test.js`。
3. **新增契约项必须 `--update` 固化**。`--strict` 下「新增未固化」也算失败，
   这是故意的：基线不能靠人记得更新。

## 10. 提交闸门现状（2026-11-09）

| 闸门 | 命令 | 覆盖 |
|---|---|---|
| 契约 | `node scripts/check-architecture.mjs --strict` | 路由/页面/存储键/导出/代理/脚本/依赖/默认参数 |
| Lint | `npm run lint` | `src` + `backend` + `render-backend` + `test`，零警告 |
| 前端单测 | `npm test` | 220 例（含存储单通道、协议一致性、契约自检） |
| 后端单测 | `npm run test:backend` | 73 例（需 Postgres :55432） |
| 构建 | `npm run build` + `npm run check:bundle` | 产物与体积预算 |
| 本地等价 CI | `node scripts/verify-all.mjs` | 以上全部；无数据库时显式 SKIP |
| CI | `.github/workflows/verify.yml` | 同上，两个 job |
