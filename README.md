# XYZW Web Helper

<div align="center">

![XYZW Logo](public/xiaoyugan.png)

**咸鱼（XYZW）游戏辅助 Web 控制台 —— 纯前端，Token 即身份，数据只存在你的浏览器里**

[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A524-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.19-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[快速开始](#-快速开始) · [命令速查](#-命令速查) · [目录结构](#-目录结构) · [部署](#-部署) · [常见问题](#-常见问题) · [开发文档](#-开发文档与回归护栏)

</div>

---

## 📌 这是什么

一个**纯前端的游戏自动化控制台**：把游戏 Token 导入浏览器 → 前端用 WebSocket（BON 二进制协议）直连游戏服 → 做角色查询、日常任务、批量托管、军团战、爬塔等操作。

| 项目 | 说明 |
|---|---|
| 包名 / 版本 | `xyzw-token-manager` · `2.0.0` |
| 形态 | 单页应用（SPA），Vue Router history 模式 |
| 后端 | **可选后端**（`backend/`）：Fastify 5 + Postgres，托管定时任务与多设备数据同步。**不启动后端时前端与改造前完全一致**（Token、角色数据仍在 `localStorage` / `IndexedDB`） |
| 身份 | 没有账号密码体系，**Token 就是身份** |
| 仓库 | <https://github.com/qiaojianhui99-beep/xyzw-helper> |

> 也就是说：部署 = 把 `dist/` 静态文件托管出去 + 配好几条反向代理。没有数据库、没有登录接口、没有服务端会话。

---

## ✨ 核心特性

| 模块 | 能力 |
|---|---|
| **Token 管理** | 手动输入 Base64、URL 拉取（支持一键刷新）、伏羲 `.bin` 批量导入；自动识别多种 Base64/JSON/前缀格式 |
| **多角色** | 一个浏览器管多个账号，展示角色等级、职业、服务器、战力等 |
| **WebSocket 通信** | BON 协议编解码 + 多重加密（LZ4 `lx` / XOR `x` / XXTEA `xtm` 自动识别），心跳与指数退避重连 |
| **连接池** | 批量任务默认并发 **2**，连接建连间隔 500ms，`localStorage.activeConnections` 做跨标签页互斥 |
| **自动化任务** | 日常任务（签到、领奖、竞技场、爬塔）、批量日常、主线推关、月度任务、军团战/实时盐场 |
| **游戏功能页** | 角色/队伍/公会/塔/钓鱼/箱子/招募/精炼等业务卡片，按目录拆分 |
| **内嵌游戏** | `/game`、`/multi-game` 用 iframe 内嵌 `public/game/index.html`（Cocos 打包产物） |
| **主题** | 深浅色热切换，跟随系统偏好，记忆用户选择（`MutationObserver` 同步 Naive UI Portal） |
| **调试工具** | 内置消息测试器（BON 编解码）、WebSocket 测试页、协议验证脚本 |

---

## 🧱 技术栈

- **框架**：Vue 3.5（Composition API + `<script setup>`）、Vue Router 4、Pinia 2
- **构建**：Vite 5.4、UnoCSS、SCSS、`unplugin-vue-router`（文件即路由）、`unplugin-auto-import`、`unplugin-vue-components`
- **UI**：Naive UI 2.43 为主，Arco Design Vue 2.57 并存；Arco 走 resolver 自动按需引入
- **协议 / 工具**：`lz4js`、`crypto-js`、`p-queue`、`idb`、`axios`、`xlsx`、`moment`
- **语言**：JS / TS 混合 —— 核心 `stores/tokenStore.ts` 用 TS，其余多为 JS
- **质量闸门**：ESLint（`--max-warnings 0`）、Prettier、`node --test`、架构契约校验脚本

---

## ✅ 环境要求

| 项 | 要求 |
|---|---|
| Node.js | **≥ 24**（见 `.nvmrc`，`24`） |
| 包管理器 | **pnpm 10.19.0**（`packageManager` 已固定；`npm` 也能跑） |
| 浏览器 | 现代浏览器，需 `WebSocket` / `localStorage` / `IndexedDB` / `TextEncoder` |

```bash
# 推荐：用 nvm / fnm 切到仓库锁定的 Node
nvm use            # 读取 .nvmrc
corepack enable    # 让 pnpm 版本跟随 packageManager 字段
```

---

## 🚀 快速开始

```bash
# 1. 克隆
git clone https://github.com/qiaojianhui99-beep/xyzw-helper.git
cd xyzw-helper

# 2. 安装依赖（推荐 pnpm）
pnpm install
# 或 npm install

# 3. 开发服务器（默认端口 3000，自动打开浏览器，同时监听局域网）
pnpm dev

# 4. 生产构建 → dist/
pnpm build

# 5. 预览构建产物（仅静态预览，不执行 worker.js 代理）
pnpm preview
```

打开 <http://localhost:3000> → 进入 **Token 管理** 页导入 Token → 选择角色 → 进入 **控制台 / 日常任务**。

> 页面访问控制：带 `meta.requiresToken` 的后台页（`/admin/*`）在没有 Token 时会自动跳回 `/tokens`。

---

## 🛠 命令速查

| 命令 | 作用 |
|---|---|
| `pnpm dev` | Vite 开发服务器（`:3000`，`host: true`） |
| `pnpm build` | 生产构建到 `dist/`，并把 `worker.js` 复制为 `dist/_worker.js` |
| `pnpm preview` | 预览 `dist/`（静态） |
| `pnpm lint` | ESLint 全量检查，**警告即失败**（`--max-warnings 0`） |
| `pnpm lint:fix` | 同上，自动修复 |
| `pnpm format` / `pnpm format:check` | Prettier 写入 / 校验 |
| `pnpm test` | `node --test test/*.test.js` |
| `pnpm check:arch` | 架构契约校验（路由 / 存储键 / 导出 / 默认参数 / 依赖） |
| `pnpm check:arch:strict` | 同上，但**新增未固化**也算失败（CI 与 `verify` 用这个） |
| `pnpm update:arch` | 把**新增**能力并入契约基线（不允许顺手删） |
| `pnpm verify` | **提交前必跑**：契约(`--strict`) → lint（含 `backend/`）→ 单测 |
| `pnpm verify:full` | 再加生产构建与产物体积预算（改构建/依赖时用） |
| `node scripts/verify-all.mjs` | **本地等价 CI**：上面全部 + 后端 73 测试（无数据库会显式标 SKIP） |
| `pnpm test:backend` | 后端 73 个测试（需先 `pnpm db:up`） |
| `pnpm db:up` / `db:down` / `db:reset` | 本地 Postgres（端口 55432） |
| `pnpm dev:api` / `dev:worker` | 后端的 API 进程 / worker 进程 |
| `pnpm testr` / `pnpm testd` | 手工调试脚本：角色 Token / Token 解析 |

---

## 🗂 目录结构

```text
xyzw_web_helper/
├── index.html                 入口（同时 import src/xyzw 第三方游戏包）
├── vite.config.js             插件、四条开发代理、SCSS 注入、worker 复制
├── worker.js                  Cloudflare Pages 边缘函数（构建期复制为 dist/_worker.js）
├── wrangler.toml              Cloudflare Pages 构建配置
├── staticwebapp.config.json   Azure Static Web Apps 回退配置
├── architecture.contract.json 架构契约基线（路由/存储键/导出/默认参数的“不可悄悄改”清单）
├── pnpm-workspace.yaml        工作区：根包 + backend（一次 install 装好两边）
├── .github/workflows/         CI 提交闸门（verify：前端 + 后端两个 job）
│
├── src/
│   ├── main.js                createApp + Pinia + Router + Naive UI + 主题落地
│   ├── App.vue                Provider 嵌套 + router-view
│   ├── views/                 页面（文件即路由）：Home / TokenImport / Dashboard / DailyTasks / BatchDailyTasks / GameFeatures / GameRoles / LegionWar / PushingLevels / GamePlayer / GameMultiPlayer / Profile / Changelog / Login / Register / NotFound …
│   ├── layout/                DefaultLayout.vue（/admin/* 的外壳）
│   ├── router/                手写路由（auto-routes 兜底）
│   ├── stores/                Pinia：tokenStore.ts（核心）、gameRoles、localTokenManager、events/
│   ├── composables/           useTheme.js、usePersistentRef.ts（持久化 ref，替代 useLocalStorage）
│   ├── api/                   storage.js（存储门面，唯一写入者）、storageSync.js（云同步）、index.js
│   ├── utils/                 bonProtocol.js、xyzwWebSocket.js、dailyTaskRunner.js、batch/、tokenDb.js、logger.js …
│   ├── components/            按业务分目录：Apex / Club / Common / Daily / Setting / Team / Test / Tower / cards
│   ├── composables/           useTheme.js 等
│   ├── assets/styles/         设计 token、全局 SCSS
│   ├── locales/               i18n 文案
│   └── xyzw/                  第三方游戏引擎/业务代码（只读，不参与 lint）
│
├── public/
│   ├── game/                  游戏运行时（Cocos 产物，iframe 内嵌）
│   ├── box/ fish/ team/ icons/ 业务图标资源
│   └── xiaoyugan.png          项目 Logo
│
├── test/                      node:test 单测（含存储单通道、协议一致性、契约测试）
├── scripts/                   架构契约校验、verify-all（本地等价 CI）、产物体积基线
├── docs/                      项目文档（部署、契约、回归清单、协议指南）
├── design-system/             视觉基准 MASTER.md + 页面级覆盖
├── deploy/                    Dockerfile / nginx.conf / compose / 一键部署脚本 / 代理服务
├── server/                    Python Flask 版 Token URL 服务（可选）
├── backend/                   Fastify + Postgres 后端（可选，见 docs/BACKEND.md）
│   ├── src/api/               Fastify 装配与路由
│   ├── src/worker/            cron 调度与任务执行（独立进程）
│   ├── src/infra/             db / crypto / logger / sql
│   ├── sql/                   建表脚本（001 表结构 / 002 Token 密文列 / 003 存储镜像）
│   └── test/                  73 个后端测试（含与改造前的对拍基准）
├── render-backend/            旧版 Express + Supabase 半成品（已被 backend/ 取代，仅保留作对拍基准）
└── edge-functions/            腾讯 EdgeOne Pages 边缘函数
```

---

## 🔀 开发代理（只在 `pnpm dev` 生效）

前端不直连第三方域名，靠 `vite.config.js` 的 `server.proxy` 绕开跨域并伪装 UA/Host：

| 前缀 | 目标 | 用途 |
|---|---|---|
| `/api/hortor-ucenter` | `comb-platform.hortorgames.com`（Host 改写为 `ucenter-app-server...`） | 手机号验证码登录 |
| `/api/hortor` | `comb-platform.hortorgames.com` | Hortor 平台登录 |
| `/api/weixin` | `open.weixin.qq.com` | 微信扫码登录 |
| `/api/weixin-long` | `long.open.weixin.qq.com` | 扫码状态轮询 |

> **线上必须自己承接这四条代理**（nginx / Cloudflare / EdgeOne），否则登录会 404。
> 代理前缀属**契约**：只许新增，不许改名。见 [docs/OPEN-CLOSED-RULES.md](docs/OPEN-CLOSED-RULES.md)。

---

## 🏗 架构要点（改动前必看）

1. **Token 生命周期**：导入 → Base64 解码（JSON / 纯文本 / 带前缀 / `.bin` / URL）→ 存 `localStorage` → 选角色 → 入连接队列 → 建 WebSocket → 收发 BON 报文。
2. **BON 协议**（`src/utils/bonProtocol.js`）：`store_setpurchase`、`fight_level` 等报文**必须走编码体**（`{ rawBody: true }`），普通对象会被服端拒绝；解码失败时退回 JSON。
3. **连接并发**：批量任务默认 `maxActive = 2`，`connectionQueue.active` 是全局计数；跨标签页用 `localStorage.activeConnections` 互斥。**不要在任务里绕过队列自己建连。**
4. **路由大小写**：`/admin/PushingLevels` 是历史大写路径，别顺手“规范化”。
5. **数据存储**：轻量数据走 `useLocalStorage`，二进制/大对象走 IndexedDB（`src/utils/tokenDb.js`）。
6. **契约护栏**：路由 path、`localStorage` 键名、store 方法名、utils 导出名、命令默认 body、BON 编解码、批量默认参数都固化在 `architecture.contract.json`，`pnpm check:arch` 会拦下删除/改名。

### 数据流

```text
Token 导入 → Base64 解码 → 本地存储 → 选中角色 → 连接队列(限流) → WebSocket → BON 编解码 → 游戏服
   ↑            ↓              ↓            ↓              ↓                ↓
 手动/URL/bin  多格式解析   localStorage   路由守卫      maxActive=2      lx/x/xtm
```

---

## 🚢 部署

四种方式，按场景挑一个（细节见 [docs/DEPLOY.md](docs/DEPLOY.md)）：

| 方案 | 适合 | 成本 | 命令 / 入口 |
|---|---|---|---|
| **A. Docker Compose** | 有台 VPS，要一条命令跑起来 | 最低 | `docker compose -f deploy/docker-compose.yml up -d --build` |
| **B. 裸机 nginx + rsync** | 已装 nginx / 宝塔，只放静态文件 | 低 | `bash deploy/deploy.sh <user@host> [WEB_ROOT] [SITE_NAME]` |
| **C. Cloudflare Pages** | 不想运维，要免费 CDN + HTTPS | 零 | 连 Git 仓库，构建 `npm run build`，输出 `dist` |
| **D. 腾讯 EdgeOne Pages** | 国内访问速度要求高 | 零 | 用 `edge-functions/` 目录，构建同上 |

### A. Docker Compose（推荐自建）

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
# 访问 http://<服务器IP>:8080 ；改端口改 "8080:80"
```

两个容器：`web`（Node 24 + pnpm 构建 → `nginx:1.27-alpine` 托管）与 `proxy`
（`deploy/proxy-service/server.mjs`，提供 `/api/proxy` 解码代理，共享 network namespace，监听 `127.0.0.1:3001`）。

### B. 裸机 nginx

```bash
bash deploy/deploy.sh root@1.2.3.4          # 本地构建 → 上传 → nginx 热加载
```

`deploy/nginx.conf` 已包含：SPA 回退、四条登录反代、`/api/proxy`、gzip。

### C. Cloudflare Pages

1. Dashboard → Pages → Connect to Git → 选本仓库
2. 构建命令 `npm run build`，输出目录 `dist`
3. `worker.js` 会被复制成 `dist/_worker.js`，Pages 自动进入 Advanced Mode（API 代理 + 静态托管）

本地全功能预览（含 worker 代理）：

```bash
pnpm build
npx wrangler pages dev dist     # http://localhost:8787
```

> `pnpm preview` 只做静态预览，**不会执行 `worker.js`**。

### 可选的 Token URL 服务（Python）

`server/` 下是一个 Flask 配套服务：多用户管理、上传 `.bin`、生成带专属 Token 的取 Token 链接。

```bash
cd server
pip install -r requirements.txt
python app.py                 # 0.0.0.0:5000，首次启动生成 server/config.json（默认 admin/admin123）
```

> 首次登录后请立刻改密码 / 建新账号。

---

## 🔑 环境变量

**本项目运行期不需要任何环境变量**，没有 `.env` 也能起。只有两个 Vite 内置变量会被代码读到：

| 变量 | 用途 |
|---|---|
| `import.meta.env.BASE_URL` | 拼接静态资源路径（图标、`public/game/index.html` 等） |
| `import.meta.env.DEV` | 日志器开关（开发模式打印更多日志） |

仓库已忽略 `.env*`（保留 `.env.example`）；需要自定义时自行 `cp .env.example .env.local`。

---

## 🔐 安全与隐私

- **数据不出浏览器**：Token、角色数据只落 `localStorage` / `IndexedDB`，没有上报接口。
- **界面掩码**：Token 展示只露首尾 4 位。
- **凭证不入库**：`.gitignore` 已挡住 `*.bin`、`xyzw_data/`、`*.token`、`.env*`、抓包 `*.har`。
- **传输加密**：游戏服连接使用 `wss://`；报文层再叠 LZ4 / XOR / XXTEA。
- **跨标签页互斥**：同一 Token 不会在多个标签页重复建连。
- ⚠️ 不要把 Token、`.bin`、`server/config.json` 提交到公开仓库；截图前先打码。

---

## 🧭 开发规范与回归护栏

动手前先读这三份，能省掉大部分返工：

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | 接手路牌：硬规则、常用命令、护栏机制、已知雷区 |
| [docs/PROJECT-OVERVIEW.md](docs/PROJECT-OVERVIEW.md) | 项目全景：目录、数据流、Token/连接/协议契约、路由表、勘误表 |
| [docs/OPEN-CLOSED-RULES.md](docs/OPEN-CLOSED-RULES.md) | 扩展点在哪、什么绝对不能改、破坏性变更流程 |
| [docs/REGRESSION-CHECKLIST.md](docs/REGRESSION-CHECKLIST.md) | 回归清单：L0 自动闸门 / L1 冒烟手测 / L2 真机只读验证 |

视觉规范另见 [design-system/xyzw-console/MASTER.md](design-system/xyzw-console/MASTER.md)：配色 / 字号 / 间距 / 组件规范 / 反模式；页面级差异写 `design-system/xyzw-console/pages/<page>.md`。

**三条规矩**

1. **只许加，不许悄悄改**：新增页面/组件/命令 = 新文件 + 新注册项；既有路由 path、存储键、方法名、导出名、默认参数都是对外契约。
2. **提交前 `pnpm verify` 全绿**（契约 strict → lint 零警告 → 单测）；涉及构建/依赖跑 `pnpm verify:full`。
3. **不碰第三方产物**：`src/xyzw/**`、`public/game/**`、`public/{box,fish,team,icons}/**`。

**2026-11 收口新增的三条红线**

| 红线 | 说明 | 门禁 |
|---|---|---|
| 持久化只能经 `src/api/storage.js` | 响应式场景用 `usePersistentRef`；禁止新增 `useLocalStorage` 或 `localStorage` 直调（两条通道会让云同步静默失效） | `test/storageChannel.test.js` |
| BON 协议改一侧必须改另一侧 | 前端 `src/utils/bonProtocol.js` 与后端 `backend/src/protocol/bonProtocol.js` 是两份实现 | `test/protocolParity.test.js` |
| 新增契约项必须固化 | `--strict` 下「新增未固化」也算失败，跑 `pnpm update:arch` | `pnpm check:arch:strict` |

> 提交闸门：`.github/workflows/verify.yml`（前端 job + 起 Postgres 的后端 job）。
> 本地等价命令 `node scripts/verify-all.mjs`；没有数据库时会显式标注 SKIP，不会假装通过。

新增功能落点速查：

| 要加的东西 | 放哪 |
|---|---|
| 页面 | `src/views/Xxx.vue` + `src/router/index.js` 一条（设 `meta.title` / `requiresToken`） |
| 组件 | `src/components/<域>/Xxx.vue`（自动注册，无需 import） |
| 游戏命令 | `src/utils/xyzwWebSocket.js` 的 `registerDefaultCommands` 里 `.register(...)` |
| 报文模板 | `src/utils/bonProtocol.js` 的 `GameMessages` |
| 单账号任务 | `src/utils/dailyTaskRunner.js` 或新的 `*Runner.js` |
| 批量任务 | `src/utils/batch/tasksXxx.js` + 注册表 + `defaultTemplate` |
| 服务端推送 | `src/stores/events/xxx.ts` + `index.ts` 注册 |
| 新状态 | `useLocalStorage("newKey", 默认值)`，键名带业务前缀 |

---

## ❓ 常见问题

**Q：刷新 `/admin/xxx` 直接 404？**
SPA 用的是 history 模式，服务器必须把未知路径回退到 `index.html`。`deploy/nginx.conf` 里已有 `try_files $uri $uri/ /index.html;`；静态托管平台要手动配置。

**Q：手机号验证码 / 微信登录线上报 404？**
线上没接那四条 `/api/*` 反代。开发环境的代理只在 `pnpm dev` 生效，线上要在 nginx / Cloudflare / EdgeOne 里补。

**Q：“URL 导入 Token / 一键刷新”失败？**
它依赖 `/api/proxy?url=`。Cloudflare 走 `worker.js`，自建走 `deploy/proxy-service/server.mjs` + nginx 反代。

**Q：`pnpm build` 后 `dist/_worker.js` 没有？**
`vite.config.js` 里的 `copy-worker` 插件会复制 `worker.js`；如果日志提示找不到源文件，检查仓库根目录是否被改动。

**Q：`pnpm lint` 报一条警告就失败？**
这是故意的（`--max-warnings 0`）。修掉或 `pnpm lint:fix`，别改脚本阈值。

**Q：`pnpm check:arch` 报“丢失 / 被改动”？**
默认处理是**恢复**，不是改基线。确属有意破坏性变更：先加测试 → 改代码 → `node scripts/check-architecture.mjs --update --allow-removals` → 在 `docs/OPEN-CLOSED-RULES.md` 变更记录表登记 → `pnpm verify:full`。

**Q：可以改批量并发上限吗？**
默认 `maxActive = 2` 是为了避免把服端打爆。批量默认参数在契约基线里，改之前先跑回归。

---

## 📄 许可与免责声明

本项目基于 [CC BY-NC-SA 4.0](LICENSE) 发布：

- ✅ 允许：个人学习、研究、修改、非商业分享（需署名 + 相同协议）
- ❌ 禁止：任何商业用途、售卖、商业化运营

**免责声明**：本项目仅用于学习与技术研究。使用者需自行承担使用风险与合规责任；作者不对因使用本项目产生的账号异常、数据丢失或其他后果负责。请遵守游戏服务条款与当地法律法规。

---

## 💬 反馈与联系

- 仓库：<https://github.com/qiaojianhui99-beep/xyzw-helper>
- 问题反馈：<https://github.com/qiaojianhui99-beep/xyzw-helper/issues>
- 提 PR 前请先 `pnpm verify` 全绿，并遵循 [AGENTS.md](AGENTS.md) 的“只加不改”规则

<div align="center">

**⭐ 如果这个项目对你有帮助，点个 Star 支持一下**

</div>
