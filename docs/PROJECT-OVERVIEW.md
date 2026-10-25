# 项目沉淀：XYZW Web Helper 全景

> 本文是**当前代码的说明书**，不是愿景。写于 2026-10-25，依据是当时的工作树（含未提交改动）。
> 与 `CLAUDE.md` 冲突时，**以本文为准**（`CLAUDE.md` 有若干过期 API 描述，见文末「文档勘误」）。

---

## 1. 这是什么

一个**纯前端的游戏自动化控制台**：把游戏 Token 导入浏览器，用 WebSocket（BON 二进制协议）直连游戏服，做角色查询、日常任务、批量托管、军团战等操作。没有传统账号体系，**凭 Token 就是身份**，数据全部落在浏览器本地。

| 项目 | 值 |
|---|---|
| 包名 | `xyzw-token-manager@2.0.0` |
| 技术栈 | Vue 3.5 + Vite 5.4 + Pinia + vue-router 4 + Naive UI + Arco Design + UnoCSS |
| 语言 | JS/TS 混合（核心 store 与部分 utils 用 TS，其余 JS） |
| 运行时要求 | Node 24（`.nvmrc`）、pnpm 10.19.0（`packageManager` 固定） |
| 开发端口 | 3000（`server.host: true`，会打印局域网地址；`open: true` 自动开浏览器） |
| 后端 | `render-backend/` 可选 Express + Supabase 服务；前端功能不依赖它 |
| 部署 | Cloudflare Pages（`worker.js` 构建期复制为 `dist/_worker.js`）、Docker、静态站点 |

**运行形态**：单页应用 + 两个特殊容器页：

- `/game`、`/multi-game`：用 `<iframe>` 内嵌 `public/game/index.html`（真实游戏运行时，Cocos 2.x 打包产物）
- `src/xyzw/*.js`：游戏引擎/业务代码，**由 `index.html` 直接 import**，属于第三方产物，不参与 lint

---

## 2. 一分钟上手

```bash
pnpm install          # 或 npm install
pnpm dev              # http://localhost:3000
pnpm run verify       # 架构契约 + lint + 全部单测（改完必跑）
pnpm run verify:full  # 再加上生产构建
```

| 命令 | 作用 |
|---|---|
| `npm run dev` / `pnpm dev` | Vite 开发服务器，端口 3000 |
| `npm run build` | 构建到 `dist/`，并把 `worker.js` 复制成 `dist/_worker.js` |
| `npm run preview` | 预览构建产物 |
| `npm test` | `node --test test/*.test.js` |
| `npm run lint` | ESLint，`--max-warnings 0`，警告即失败 |
| `npm run format:check` / `format` | Prettier 检查 / 写入 |
| `npm run check:arch` | 只跑架构契约校验 |
| `npm run update:arch` | 把**新增**能力并入契约基线（不允许顺手删） |
| `npm run testr` / `testd` | 手工调试脚本：角色 Token / Token 解析 |
| `npm run verify` | 契约 → lint → 单测，提交前的最小闸门 |

### 开发代理（`vite.config.js`）

前端不用直连第三方域名，靠这四条代理绕开跨域并伪装 UA/Host：

| 前缀 | 目标 | 用途 |
|---|---|---|
| `/api/hortor-ucenter` | `comb-platform.hortorgames.com`（Host: `ucenter-app-server...`） | 手机号验证码登录 |
| `/api/hortor` | `comb-platform.hortorgames.com` | Hortor 平台登录 |
| `/api/weixin` | `open.weixin.qq.com` | 微信扫码登录 |
| `/api/weixin-long` | `long.open.weixin.qq.com` | 扫码状态轮询 |

> 代理前缀是**契约**：只许加，不许改（见 `docs/OPEN-CLOSED-RULES.md`）。

---

## 3. 目录地图

```
index.html                 入口，同时 import src/xyzw 游戏包
vite.config.js             Vite 配置：插件、代理、SCSS 注入、worker 复制
worker.js                  Cloudflare Pages 边缘函数副本
src/
  main.js                  createApp + Pinia + Router + Naive UI + 主题落地
  App.vue                  Naive UI Provider 嵌套 + router-view
  views/                   页面（22 个 .vue，文件即路由）
  components/              按业务分目录：Apex / Club / Common / Daily / Setting / Team / Test / Tower / cards
  layout/DefaultLayout.vue 后台页外壳（/admin/* 的父路由）
  router/index.js          手写路由（auto-routes 兜底）
  stores/
    tokenStore.ts          核心：Token 生命周期 + 连接 + 游戏数据
    auth.js                兼容用的弱登录态
    gameRoles.js           多角色数据
    localTokenManager.js   Token 本地持久化细节
    cache.ts               带并发去重的缓存
    common.ts              通用状态
    legionWarStore.js      军团战状态
    changelogStore.js      更新日志
    events/                游戏事件插件：ack/activity/chat/clock/hangup/legion/role/study/team/tower
  utils/
    bonProtocol.js         BON 编解码 + 加密 + ProtoMsg + GameMessages
    xyzwWebSocket.js       主服 WebSocket 客户端 + CommandRegistry
    xyzwLegionWarWebSocket.js 军团战独立连接
    wsAgent.js             连接建立/心跳装配
    dailyTaskRunner.js     日常任务编排（逐步执行 + 回调）
    dailyTaskState.js      日常任务状态/锁/配置
    helperTaskRunner.js    助手任务
    batch/                 批量托管（跨账号）：tasks*/connection/constants/cron/log
    tokenDb.js             IndexedDB 大对象存储
    gameLauncher/gameSelection/gameValue/gameCommands …
  api/index.js             axios 实例，baseURL /api/v1，Bearer token
  composables/useTheme.js  暗色主题单例
  locales/                 i18n（未全面启用）
  xyzw/                    第三方游戏运行时代码（勿改）
public/
  game/                    游戏运行时页面与补丁（index.html / multi-game.html / patch.js / bridge）
  box, fish, team, icons …  游戏静态资源
render-backend/            Express 后端（Supabase + node-cron + ws）
docker/                    dockerfile / nginx.conf / install 脚本
docs/                      本目录（架构与流程文档）
scripts/                   构建与校验脚本（图标、架构契约校验）
test/                      node:test 单测 + 手工调试脚本
```

---

## 4. 分层与数据流

```
用户输入 Token
   ↓ parseBase64Token（多种 Base64 包装：纯串 / token: 前缀 / JSON / bin 文件 / URL）
TokenData { id, name, token, wsUrl, server, remark, importMethod … }
   ↓ useLocalStorage("gameTokens")  ← 浏览器持久化，跨会话恢复
选中 Token（selectedTokenId）
   ↓ createWebSocketConnection
连接记录 wsConnections[tokenId] { status, client, sessionId, lastMessageAt … }
   ↓ XyzwWebSocketClient（心跳 30s、重连退避、p-queue 发送队列）
CommandRegistry.build(cmd) → Body 默认参数 → BON encode → 加密 → WebSocket
   ↓ 服务端响应
BonDecoder → ProtoMsg / GameMessages 模板 → 各业务回调（callbacks）
   ↓
gameData { roleInfo, legionInfo, bossTowerInfo, evoTowerInfo, presetTeam … }
```

### 4.1 Token 契约

```ts
interface TokenData {
  id: string;
  name: string;
  token: string;            // 原始 Base64
  wsUrl: string | null;
  server: string;
  remark?: string;
  importMethod?: "manual" | "bin" | "url";
  sourceUrl?: string;
  upgradedToPermanent?: boolean;
  upgradedAt?: string;
  updatedAt?: string;
}
```

`tokenStore` 对外承诺的方法（**改名/删掉就是破坏性变更**）：

- 状态：`gameTokens`、`selectedTokenId`、`wsConnections`、`gameData`、`tokenGroups`
- 计算：`hasTokens`、`selectedToken`、`selectedTokenRoleInfo`
- Token：`addToken`、`updateToken`、`removeToken`、`selectToken`
- 解析：`parseBase64Token`、`importBase64Token`、`validateToken`
- 连接：`createWebSocketConnection`、`closeWebSocketConnection`、`getWebSocketStatus`、`getWebSocketClient`、`setMessageListener`、`setShowMsg`
- 发送：`sendMessage`（fire-and-forget）、`sendMessageWithPromise`（带超时与 battleVersion 自动注入）、`sendGameMessage`
- 便捷：`sendHeartbeat`、`sendGetRoleInfo`、`sendSignIn`、`sendClaimDailyReward`、`sendGetTeamInfo`、`sendGetDataBundleVersion`
- 游戏内聊天：`sendMessageToLegion`、`sendMessageToWorld`
- 塔：`getCurrentTowerLevel`、`getTowerInfo`
- 版本：`setBattleVersion`、`getBattleVersion`
- 导入导出：`exportTokens`、`importTokens`、`clearAllTokens`、`cleanExpiredTokens`、`upgradeTokenToPermanent`、`initTokenStore`
- 分组：`createTokenGroup`、`deleteTokenGroup`、`updateTokenGroup`、`addTokenToGroup`、`removeTokenFromGroup`、`getTokenGroups`、`getGroupTokenIds`、`getValidGroupTokenIds`、`cleanupInvalidTokens`
- 诊断：`validateConnectionUniqueness`、`connectionMonitor`、`devTools`

### 4.2 localStorage 键（用户数据兼容层）

改键名 = 老用户数据全丢。当前 30 个键，核心几组：

| 分组 | 键 |
|---|---|
| 身份 | `gameTokens`、`selectedTokenId`、`selectedRoleInfo`、`activeConnections`、`tokenGroups` |
| 批量 | `batchSettings`、`scheduledTasks`、`task-templates` |
| Token 导入 | `bin_file_list`、`current_bin_id`、`token`、`userToken` |
| 界面 | `theme`、`tokenViewMode`、`tokenSortConfig`、`*_style`、`ws_debug_level` |
| 其他 | `changelogs`、`last_read_changelog_version`、`changelog_subscribed`、`user`、`userId`、`userPreferences`、`registeredUsers`、`club_*`、`peach_*`、`xyzw_chat_msg_list`、`scheduledTasks` |

完整列表以 `architecture.contract.json → storageKeys` 为准。

### 4.3 连接池与批量并发（真实默认值）

| 参数 | 默认 | 位置 |
|---|---|---|
| `maxActive` | 2 | `src/utils/batch/constants.js` |
| `connectionTimeout` | 10000 ms | 同上 |
| `commandDelay` | 500 ms | 同上 |
| `taskDelay` | 500 ms | 同上 |
| `reconnectDelay` | 1000 ms | 同上 |
| `maxLogEntries` | 1000 | 同上 |
| 单连接心跳 | 30 s | `src/utils/wsAgent.js` |
| 连接等待轮询 | 500 ms | `src/utils/batch/connectionManager.js` |

跨标签页互斥：`activeConnections` 写入 localStorage；同一 token 的重复连接由 `connectionLocks` + `validateConnectionUniqueness` 拦住。

### 4.4 BON 协议层（`src/utils/bonProtocol.js`）

| 环节 | 实现 |
|---|---|
| 基元读写 | `DataReader` / `DataWriter` / `Int64` |
| 编解码 | `BonEncoder` / `BonDecoder` / `bon` |
| 报文包装 | `ProtoMsg`（主服）、`ProtoMsgLegion`（盐场/军团战） |
| 加解密 | `LXCrypto`（LZ4，`lx`）、`XCrypto`（XOR，`x`）、`XTMCrypto`（XXTEA，`xtm`） |
| 便捷入口 | `encode` / `parse` / `getEnc` / `GameMessages` / `g_utils` / `bonProtocol` |

**坑**：`store_setpurchase`、`fight_level` 这类命令必须走 BON 编码体（`rawBody: true` 用于发送已编码对象），传普通 JS 对象会被服务端拒绝。详见 `docs/feature-protocol-dev-guide.md`。

### 4.5 命令注册表（`CommandRegistry`）

所有游戏命令必须先在 `registerDefaultCommands(reg)` 里 `register(cmd, defaultBody, { rawBody? })`，否则 `build()` 抛 `Unknown cmd`。覆盖范围：角色/系统、任务、招募、商店/黑市、军团/盐场、营地挑战、邮件、学习问答、战斗、怪异咸将塔、瓶子机器人、钓鱼（`artifact_*`）、灯神、礼包、爬塔、队伍/武将养成、升星等 **100+ 条**。

新增命令 = 新增 `.register(...)`，**不要改已有命令的默认 body**（改了等于改变所有用户发出的报文）。

### 4.6 事件层（`src/stores/events/`）

服务端推送按 cmd 分发到插件：`ack`（应答匹配）、`activity`、`chat`、`clock`、`hangup`、`legion`、`role`、`study`、`team`、`tower`。未注册事件走 `$any` warn 日志。新增推送类型 = 新增插件文件 + 在 `index.ts` 注册。

---

## 5. 页面与路由

手写路由 18 条（`src/router/index.js`），22 个 `views/*.vue`（文件式路由兜底，排除 `**/components/**`、`**/test**.vue`、`**/**Modal.vue`）。

| 路径 | 名称 | 页面 | 需 Token |
|---|---|---|---|
| `/` | Home | views/Home.vue | 否 |
| `/tokens` | TokenImport | views/TokenImport/TokenImport.vue（`?token=&name=&server=&wsUrl=&api=&auto=`） | 否 |
| `/game` | GamePlayer | views/GamePlayer.vue（iframe 游戏） | 是 |
| `/multi-game` | GameMultiPlayer | views/GameMultiPlayer.vue（多账号 iframe） | 是 |
| `/admin` | DefaultLayout | layout/DefaultLayout.vue | — |
| `/admin/dashboard` | Dashboard | views/Dashboard.vue | 是 |
| `/admin/game-features` | GameFeatures | views/GameFeatures.vue | 是 |
| `/admin/message-test` | MessageTest | components/Test/MessageTester.vue | 是 |
| `/admin/legion-war` | LegionWar | views/LegionWar.vue | 是 |
| `/admin/profile` | Profile | views/Profile.vue | 是 |
| `/admin/daily-tasks` | DailyTasks | views/DailyTasks.vue | 是 |
| `/admin/batch-daily-tasks` | BatchDailyTasks | views/BatchDailyTasks.vue | 是 |
| `/admin/PushingLevels` | PushingLevels | views/PushingLevels.vue（注意大小写） | 是 |
| `/websocket-test` | WebSocketTest | components/Test/WebSocketTester.vue | 是 |
| `/login` `/register` | Login / Register | 兼容用弱登录 | 否 |
| `/game-roles` | GameRoles | views/GameRoles.vue | 否 |
| `/:pathMatch(.*)*` | NotFound | views/NotFound.vue | 否 |

守卫：`requiresToken: true` 且 `!tokenStore.hasTokens` → 重定向（`/tokens`）。

---

## 6. 批量托管体系（`src/utils/batch/`）

| 文件 | 职责 |
|---|---|
| `constants.js` | `defaultBatchSettings` / `defaultTemplate` / `defaultTaskForm` / `defaultHelperSettings` |
| `index.js` | 统一出口 |
| `connectionManager.js` | 队列槽位（`connectionQueue.active` vs `maxActive`）、建连、重试 |
| `tasksLegacy.js` `tasksStore.js` `tasksItem.js` `tasksArena.js` `tasksHangUp.js` `tasksTower.js` `tasksDungeon.js` `tasksFootball.js` `tasksBottle.js` `tasksCampChallenge.js` `tasksApex.js` `tasksXuanwuBlessing.js` | 按业务拆分的任务实现 |
| `blackMarketConfig.js` | 黑市采购清单（配置与执行分离，见开发指导） |
| `cronUtils.js` | 定时表达式工具 |
| `logUtils.js` | 日志环形缓冲（`maxLogEntries`） |

定时任务用**显式注册表**分派（不 eval），新增任务 = 新文件 + 注册表条目 + `test/scheduledTaskRegistry.test.js` 覆盖。

---

## 7. 后端与部署

- `render-backend/server.js`：Express + `@supabase/supabase-js` + `node-cron` + `ws`；`/api` 走 API Key（`x-api-key` 或 `Authorization: Bearer`），`/health` 公开；日志不打印带凭据的完整 URL。
- `worker.js`：Cloudflare Pages 边缘函数；`vite.config.js` 的 `closeBundle` 钩子把它复制成 `dist/_worker.js`。
- `docker/`：dockerfile + nginx.conf + install 脚本。
- `staticwebapp.config.json`：Azure SWA 兼容配置。

---

## 8. 当前基线（2026-10-25 实测）

| 项目 | 结果 |
|---|---|
| `npm test` | 120 通过（新增契约测试后 124） |
| `npm run lint` | 0 error / 0 warning（修掉了一处 JSDoc `@param` 不匹配） |
| `npm run build` | 成功，14 s 左右；主 chunk ≈ 4.7 MB（gzip 1.27 MB），`GameFeatures` ≈ 1 MB |
| 开发服务器 | 3000 端口启动约 1 s，页面与模块转换全部 200 |
| 可选插件 | `@vitejs/plugin-basic-ssl`、`vite-plugin-vue-devtools` 未安装，走 safeImport 降级 |

**已知告警（不影响功能）**：chunk 体积警告；生产构建不再自动开 HTTPS。

---

## 9. 文档勘误（`CLAUDE.md` 与现实不符处）

写文档时逐条核对过，以下描述已过期，**别照着写代码**：

| `CLAUDE.md` 说 | 实际 |
|---|---|
| `tokenStore.connectWebSocket(tokenId)` / `disconnectAllWebSockets()` | 不存在。对外是 `createWebSocketConnection` / `closeWebSocketConnection`；`connectWebSocket` 只是 `MessageTester.vue`、`WebSocketTester.vue` 的组件内函数 |
| `tokenStore.refreshToken(tokenId)` | 不存在于 store；刷新逻辑在 `TokenImport.vue`（`refreshToken` 组件函数 + `refreshTokenFromCombUser`） |
| `queuedTokens`、`activeConnectionCount`、`getEstimatedWaitTime` | 不存在。批量并发看 `connectionQueue.active` / `batchSettings.maxActive` |
| 「最多 10 个并发连接」 | 实际默认 `maxActive = 2` |
| `useTokenStore()` 可随意调用 | 必须在 Pinia 激活后；store 的若干状态是模块级 `useLocalStorage`，import 即绑定 localStorage |

---

## 10. 继续往下读

| 想做的事 | 看哪份 |
|---|---|
| 加页面 / 加命令 / 加任务，且不碰坏旧功能 | `docs/OPEN-CLOSED-RULES.md` |
| 改完要验什么、怎么验 | `docs/REGRESSION-CHECKLIST.md` |
| 改界面/加页面时的视觉规范 | `design-system/xyzw-console/MASTER.md` |
| AI/代理接手项目先读什么 | 根目录 `AGENTS.md` |
| 具体某个游戏协议怎么试出来的 | `docs/feature-protocol-dev-guide.md` |
| 历史审查结论与真实登录验证 | `docs/code-review-2026-10-02.md`、`docs/live-validation-2026-10-02.md` |
