# AGENTS.md — 接手本项目的第一块路牌

> 给 AI 代理和人类协作者：**先读完这 60 行再动代码。**
> 项目是纯前端（Vue 3 + Vite）游戏自动化控制台，Token 即身份，数据全在浏览器本地。

## 0. 先读什么

1. `docs/PROJECT-OVERVIEW.md` — 项目是什么、目录、数据流、契约清单、当前基线
2. `docs/OPEN-CLOSED-RULES.md` — 加功能往哪加、什么绝对不能改
3. `docs/REGRESSION-CHECKLIST.md` — 改完要验什么
4. 具体协议细节：`docs/feature-protocol-dev-guide.md`

`CLAUDE.md` 自 2026-11 起只是**导航指针**（不再维护 API 清单），过期描述已移除；
需要历史勘误时看 `PROJECT-OVERVIEW.md` 第 9 节。

## 1. 三条硬规则

1. **只许加，不许悄悄改。** 新增页面/组件/命令/任务 = 新文件 + 新注册项。既有路由 path、localStorage 键名、
   store 方法名、utils 导出名、命令默认 body、BON 编解码、批量默认参数，都是对外契约。
2. **改完必须 `npm run verify` 全绿**（架构契约 → lint 零警告 → 单测）。涉及构建/依赖时跑 `npm run verify:full`。
3. **不碰第三方产物**：`src/xyzw/**`、`public/game/**`、`public/{box,fish,team,icons}/**`。

## 2. 常用命令

```bash
npm run dev            # 开发服务器，http://localhost:3000
npm test               # node --test test/*.test.js
npm run lint           # ESLint，--max-warnings 0（警告即失败）
npm run check:arch        # 架构契约校验（新增项只提示）
npm run check:arch:strict # 同上，但新增项也算失败（CI / verify 用这个）
npm run update:arch       # 把「新增」并入基线（不允许顺手删）
npm run verify            # 契约(--strict) + lint + 单测 ← 提交前必跑
npm run verify:full       # 再加生产构建与产物预算
node scripts/verify-all.mjs  # 本地等价 CI（额外含后端测试）
```

## 3. 护栏怎么工作

- 基线文件：`architecture.contract.json`（路由/页面/导出/存储键/代理/脚本/依赖/默认参数）
- 校验器：`scripts/check-architecture.mjs`（基线有、现在没有 → 退出码 1）
- 测试：`test/architectureContract.test.js`（接入 `npm test`，并防止基线被清空后假通过）

如果校验报「丢失/被改动」，**默认处理是恢复，不是改基线**。
确属有意破坏性变更：先加测试 → 改代码 → `node scripts/check-architecture.mjs --update --allow-removals`
→ 在 `docs/OPEN-CLOSED-RULES.md` 的变更记录表登记 → `npm run verify:full`。

## 4. 加功能的标准姿势

| 要加的东西 | 落点 |
|---|---|
| 页面 | `src/views/Xxx.vue` + `src/router/index.js` 一条（设 `meta.title` / `requiresToken`） |
| 组件 | `src/components/<域>/Xxx.vue`（自动注册，不用手动 import） |
| 游戏命令 | `src/utils/xyzwWebSocket.js` 的 `registerDefaultCommands` 里 `.register(...)`；需编码体加 `{ rawBody: true }` |
| 报文模板 | `src/utils/bonProtocol.js` 的 `GameMessages` |
| 单账号任务 | `src/utils/dailyTaskRunner.js` 独立步骤 / 新 `*Runner.js` |
| 批量任务 | `src/utils/batch/tasksXxx.js` + 注册表 + `defaultTemplate` |
| 服务端推送 | `src/stores/events/xxx.ts` + `index.ts` 注册 |
| 新状态 | `usePersistentRef("newKey", 默认值)`（`@/composables/usePersistentRef`），键名带业务前缀 |
| 登录代理 | `vite.config.js` `proxy` 追加前缀 |
| **后端路由** | `backend/src/api/routes/Xxx.js` + 在 `backend/src/api/app.js` 的 `/api` 作用域内 `register` |
| **后端领域逻辑** | `backend/src/domain/`（纯逻辑，不碰 HTTP/DB 细节） |
| **任务字典** | `backend/src/protocol/taskDefinitions.js`（对外契约：只许新增 key，不许改名） |
| **前端存储访问** | 一律经 `@/api/storage` 的 `storage.getItem/setItem/removeItem`，**不要再直调 `localStorage`** |

> 后端结构、API 清单、加密设计与对拍机制：见 [`docs/BACKEND.md`](docs/BACKEND.md)。
> 后端测试：`pnpm run test:backend`（需先 `pnpm run db:up`）。改后端同样要跑 `pnpm verify`。

每加一项，配一条测试。测试断言**行为**（发出的报文、状态流转、错误处理），不断言实现细节。

## 5. 已知雷区

- BON 编码：`store_setpurchase`、`fight_level` 等必须走编码体，普通对象会被服端拒绝。
- 连接并发：默认 `maxActive = 2`，`connectionQueue.active` 是全局计数；别在任务里绕过队列自己建连。
- 跨标签页：`localStorage.activeConnections` 做互斥；手改它会造出重复连接。
- 路由大小写：`/admin/PushingLevels` 是历史大写，别顺手「规范」成小写。
- lint 零容忍：新增 JSDoc 必须和函数签名一致，否则 `--max-warnings 0` 直接失败。
- 构建体积：已完成分包（`docs/BUILD-OPTIMIZATION.md`），**首屏 JS ≈ 356 kB**（预算 450 kB，`npm run check:bundle` 会拦），
  懒加载后最大单文件约 0.8 MB；加依赖前先跑一次 `check:bundle` 看有没有破预算。
- 可选插件（`@vitejs/plugin-basic-ssl`、`vite-plugin-vue-devtools`）缺失属正常，走 safeImport 降级。
- 事件插件写了不等于生效：`src/stores/events/*.ts` 必须在 `index.ts` 里 `Xxx(evmInst)` 注册。
  `activity` / `clock` 目前**故意未装配**（会改变推送处理，属产品决策）；
  `test/eventPlugins.test.js` 会拦住「新增插件忘注册」。

## 6. 提交纪律

- 不主动 `git commit` / `git push`，除非用户明确要求。
- 一次提交只做一件事：新增功能、修 bug、重构、格式化分开。
- 改到契约：提交信息里写清楚「破坏性变更 + 影响面」。

## 7. 美化界面用哪个技能

本机已装用户级技能 **`ui-ux-pro-max`**（`~/.dsh/skills/ui-ux-pro-max`），做页面/组件视觉与交互时先加载它：

```bash
# 新页面 / 整体视觉方向（本项目 stack = vue）
python3 "$HOME/.dsh/skills/ui-ux-pro-max/scripts/search.py" "<产品类型> <关键词>" --design-system -p "XYZW Console"
# 定点问题
python3 "$HOME/.dsh/skills/ui-ux-pro-max/scripts/search.py" "loading feedback skeleton" --domain ux
python3 "$HOME/.dsh/skills/ui-ux-pro-max/scripts/search.py" "composition api" --stack vue
```

它给的是**建议**，优先级低于本仓库契约：调样式随便改，改路由/数据结构/默认参数仍按第 1 节规则走。
现有设计语言是 Naive UI + Arco + 自有 SCSS token（`src/assets/styles/`），落地时优先复用既有 token，
不要引入第二套设计系统。

**全局视觉基准已落盘：`design-system/xyzw-console/MASTER.md`**（按仓库真实 token 校准，
含配色/字号/间距/组件规范/8 条本地反模式/5 条已测对比度缺陷）。改任何页面前先读它；
页面级差异写 `design-system/xyzw-console/pages/<page>.md` 覆盖，不要去改 Master 的全局规则。
不要对 Master 跑 `--force`。



## 8. 2026-11 收口新增的四条（同样不可协商）

1. **存储单通道**：持久化只经 `src/api/storage.js`；响应式用
   `src/composables/usePersistentRef.ts`。禁止新增 `useLocalStorage` 或
   `window.localStorage` 直调（历史遗留：`src/utils/gameLauncher.js` 的 4 处例外，
   改动它时要顺手收口）。门禁测试：`test/storageChannel.test.js`。
2. **协议两份实现必须同步**：`src/utils/bonProtocol.js` 为主实现，
   `backend/src/protocol/bonProtocol.js` 是历史副本（2026-11-10 已补齐
   `ProtoMsgLegion` / `GameMessages`，两端导出与报文模板集合一致）。
   改任一侧必须让 `test/protocolParity.test.js` 全绿 —— 它会比对明文字节、
   三通道密文互通、导出集合与模板集合。长期目标：抽共享包，删副本。
3. **契约 strict**：`node scripts/check-architecture.mjs --strict` 把「新增未固化」
   也算失败。加功能后跑一次 `--update` 固化，再跑 `--strict` 确认。
4. **后端进闸门**：`npm run lint` 已覆盖 `backend/`；`node scripts/verify-all.mjs`
   本地等价 CI（含后端测试，探测不到 Postgres 会显式标 SKIP 而不是假装通过）。

## 9. 目录职责（新增代码请对号入座）

| 目录 | 职责 | 不该出现 |
|---|---|---|
| `src/api/` | 后端 HTTP 客户端、存储门面与同步逻辑 | 业务状态、组件 |
| `src/utils/` | 无状态纯逻辑（协议、计算、格式化） | 直接读写持久化、UI 依赖 |
| `src/utils/batch/` | 批量任务的纯逻辑与任务工厂；`activityWindows.js` 是活动开放规则的唯一实现 | 视图内联重复的日期判断 |
| `src/stores/` | Pinia 状态与跨组件协调 | 直接调 `fetch` |
| `src/composables/` | 可复用的响应式组合函数 | 协议编解码 |
| `src/components/` | 业务组件（按域分目录） | 全局单例 |
| `backend/src/api/` | Fastify 装配与路由 | 领域逻辑、SQL 拼接 |
| `backend/src/domain/` | 领域服务（唯一拿 Token 明文的地方） | HTTP/DB 细节 |
| `backend/src/infra/` | db / crypto / logger / sql 白名单 | 业务判断 |
| `backend/src/worker/` | cron 调度与任务编排 | 路由 |
