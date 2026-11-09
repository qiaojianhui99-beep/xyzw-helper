# 后端（Fastify + Postgres）

> 本文只讲后端。前端契约、路由、存储键仍以根目录 `AGENTS.md` 与 `docs/` 下三份文档为准。

## 这是什么

原始项目是纯前端 SPA：Token 存 `localStorage`，浏览器直连游戏服。后端目录 `render-backend/` 是未完成的半成品（依赖 Supabase PostgREST，缺真实项目时无法启动）。

本目录 `backend/` 把它重做成可运行、可测试、可部署的形态：

| 维度 | 改造前 | 改造后 |
|---|---|---|
| HTTP 框架 | Express 4（`render-backend/server.js`） | **Fastify 5** |
| 数据访问 | `@supabase/supabase-js`（PostgREST HTTP） | **`pg` 直连 Postgres** |
| Token 存储 | 明文列 | **明文列 + AES-256-GCM 密文列（`token_enc`）双写** |
| 进程模型 | HTTP + cron 同进程 | **api / worker 双进程，advisory lock 保证单 worker** |
| 测试 | 无 | **73 个后端测试 + 与改造前的对拍基准** |
| 配置校验 | 缺变量也能启动 | **启动即 fail-fast** |

## 目录结构

```
backend/
├── Dockerfile                  api 与 worker 共用镜像
├── docker-compose.dev.yml      本地 Postgres（端口 55432）
├── package.json
├── sql/
│   ├── 001_init.sql            复刻原版三张表（camelCase 列名保真）
│   ├── 002_token_enc.sql       Token 密文列
│   └── 003_storage.sql         前端 localStorage 的云端镜像表
├── src/
│   ├── config.js               环境变量集中校验
│   ├── api/
│   │   ├── app.js              Fastify 装配 + 启动
│   │   ├── plugins/authGuard.js  API Key 鉴权（常量时间比较）
│   │   └── routes/             tokens / tasks / logs / storage
│   ├── domain/
│   │   └── tokenService.js     Token 双写、解密入口（全库唯一拿明文的地方）
│   ├── infra/
│   │   ├── db.js               连接池、int8 类型对齐、PG 错误码映射
│   │   ├── crypto.js           AES-256-GCM 信封加密
│   │   ├── logger.js           结构化日志（字段名与 /api/logs 契约一致）
│   │   └── sql.js              白名单列拼 SQL
│   ├── protocol/
│   │   ├── bonProtocol.js      从 render-backend 原样搬移
│   │   ├── gameClient.js       从 render-backend 原样搬移
│   │   └── taskDefinitions.js  17 个任务字典（对外契约，只许加）
│   └── worker/
│       ├── main.js             进程入口：抢锁 → 注册 cron → 优雅关闭
│       ├── lock.js             advisory lock + 会话锁可用性探测
│       ├── scheduler.js        node-cron 注册/重载
│       └── runner.js           任务执行编排（可注入客户端，便于测试）
└── test/                       73 个测试
```

## 本地开发

`backend/` 已在根 `pnpm-workspace.yaml` 里，**依赖由根目录一次安装**（不再有独立锁文件）：

```bash
pnpm install            # 一次装好前端 + backend
```

```bash
# 1. 起数据库（首次会自动执行 sql/001、002、003）
pnpm run db:up

# 2. 起 API（默认 3002）
pnpm run dev:api

# 3. 起 worker（另开一个终端）
pnpm run dev:worker
```

环境变量（都有开发默认值，不配也能跑）：

```bash
DATABASE_URL=postgresql://xyzw:xyzw_dev_pw@127.0.0.1:55432/xyzw
API_KEY=dev-api-key
TOKEN_MASTER_KEY=<32 字节的 base64>   # 不配则明文模式，仅限本地
TOKEN_KEY_ID=k1
MAX_CONCURRENT_TOKENS=2               # 单个任务同时连几个角色
```

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## API 清单

除 `/health` 外全部需要 `x-api-key` 或 `Authorization: Bearer <key>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 免鉴权：`{ status, time, activeCrons, logsInMemory }` |
| GET | `/api/tokens` | Token 列表（**不含密文列**） |
| POST | `/api/tokens` | 新建；写明文 + 密文双列，返回数组（保持原版 200） |
| GET | `/api/tokens/:id` | 单个 |
| DELETE | `/api/tokens/:id` | `{ ok: true }` |
| GET | `/api/tasks` | 定时任务列表 |
| POST | `/api/tasks` | 新建并注册 cron |
| PATCH | `/api/tasks/:id` | 更新并重载全部 cron |
| DELETE | `/api/tasks/:id` | 删除并重载 |
| POST | `/api/tasks/:id/run` | 立即执行（异步），返回 `{ status: "running", task }` |
| GET | `/api/logs?limit=N` | 进程内存日志 |
| GET | `/api/logs/db?limit=N` | `task_logs` 表，按时间倒序 |
| GET | `/api/task-definitions` | 17 个任务字典 |
| GET | `/api/storage/all` | 前端存储的云端全量快照：`{ key: { value, updatedAt } }` |
| POST | `/api/storage/patch` | `{ patch: { key: value\|null } }` 写穿同步 |
| GET | `/api/storage/:key` | 单键读取：`{ key, value, updatedAt }` |

> `updatedAt` 是合并的关键。前端 `boot()` 用它判断「云端更新还是本地更新」：
> 云端更新则采纳，本地更新则保留并回传。没有它，前端只能二选一
> （无条件覆盖 = 丢本地写入；无条件保留 = 永远收不到别的设备更新）。

## 数据模型

| 表 | 用途 | 关键点 |
|---|---|---|
| `tokens` | 游戏 Token | `token`（明文，兼容前端直连）+ `token_enc`（密文）+ `token_masked`；camelCase 列名必须原样返回 |
| `cron_tasks` | 定时任务 | 同时保留新旧字段名（`cron_expr`/`cron_expression`、`selected_tokens`/`token_ids`）以兼容存量数据 |
| `task_logs` | 执行日志 | 每条命令一行；每天 12:00 清理前一天 |
| `user_storage` | 前端 localStorage 镜像 | `value` 是 text（与 localStorage 同构，避免二次 JSON 编码） |

## 安全设计

1. **Token 加密**：`token_enc` 是 AES-256-GCM 信封密文，形如 `{ v, kid, iv, tag, ct }`。`kid` 支持密钥轮换。
2. **明文只出现在三处**：浏览器内存、API 处理请求的瞬间、worker 解密后的内存。**不进日志、不进响应、不进数据库密文列**。
3. **唯一解密入口**：`domain/tokenService.js` 的 `resolveCredentials()`。审计只需看这一个函数。
4. **响应列白名单**：`TOKEN_PUBLIC_COLUMNS` 明确排除 `token_enc`，`SELECT *` 不会泄漏密文。
5. **同步黑名单**：`activeConnections`、`bin_data_*`、`ws_connection_*`、`xyzw_chat_msg_list` 等进程级键在**前后端两侧**都被拒绝同步。
6. **鉴权**：常量时间比较，避免逐字符短路泄露 key 前缀。
7. **Docker**：非 root 运行。

⚠️ **Postgres 端口注意**：worker 需要**会话级** advisory lock 来保证单实例。Supabase 的 transaction pooler（6543）不支持会话级锁，worker 必须连 5432。启动时会主动探测并告警，不会静默降级。

## 测试

```bash
pnpm run test:backend        # 73 个，需要数据库
pnpm run verify              # 前端：契约 + lint + 173 单测
pnpm run verify:full         # 再加生产构建
```

### CI

唯一权威文件是 `.github/workflows/verify.yml`（2026-11 起已落位，此前为规避
token 的 `workflow` scope 而放在 `docs/ci/`，导致 **CI 从未真正运行**）。
说明见 `docs/ci/README.md`。

推送若仍被 GitHub 拒绝，先补 scope 或网页端粘贴：

```bash
gh auth refresh -s workflow
git add .github/workflows/verify.yml && git commit -m "ci: 启用 verify workflow" && git push
```

本地等价：`node scripts/verify-all.mjs`（含后端测试；无数据库时显式标 SKIP）。

两个 job 刻意拆开：`frontend`（契约 + lint + 173 单测 + 构建，不需要数据库）与 `backend`（Postgres service + 73 后端测试）。这样失败时能立刻分辨是「契约/lint 问题」还是「后端逻辑问题」。

后端测试分布：

| 文件 | 数量 | 覆盖 |
|---|---|---|
| `supabase-shim` | 14 | 让原版跑在本地 PG 上的兼容层 |
| `crypto` | 12 | 加解密往返、篡改检测、密钥版本、掩码 |
| `api` | 21 | 12 条路由 + 鉴权 + 边界 + 错误码 |
| `runner` | 13 | 任务编排、命令去重、并发闸、旧字段兼容 |
| `storage` | 13 | 存储同步端点与黑名单 |
| `parity` | 1 | 与改造前逐字节对拍（需 `PARITY_BASE`） |

### 与改造前的一致性是怎么证明的

`render-backend/server.js` 依赖 Supabase 的 PostgREST，没有真实项目就起不来。因此：

1. `scripts/supabase-shim.js` 实现了 `.from().select/insert/update/delete + .eq/.order/.limit/.single` 到 `pg` 的映射；
2. `scripts/loader.mjs` 用 module resolve hook 把 `@supabase/supabase-js` 重定向到 shim，**原版 545 行一行未改**就跑在本地 PG 上；
3. `scripts/capture-baseline.mjs` 打 17 条用例，存成 `test/fixtures/baseline.original.json`；
4. `test/parity.test.js` 打新服务，与基准逐字节比对（uuid/时间戳归一化）。

结果：**Fastify 版与原版 Express 17 条用例 0 差异**。该测试做过负向验证（故意改一个状态码 → 精确报出 `[#2 GET /api/tokens] status 基准: 418 实测: 200`），确保它不是「永远通过」。

复现：

```bash
# 终端 1：装好 render-backend 依赖后启动原版（走 shim）
DATABASE_URL=... API_KEY=dev-api-key PORT=3100 \
  node --import ./backend/scripts/register-shim.mjs render-backend/server.js

# 终端 2：抓基准
node backend/scripts/capture-baseline.mjs --base=http://127.0.0.1:3100 \
  --out=backend/test/fixtures/baseline.original.json

# 终端 3：对新版对拍
PARITY_BASE=http://127.0.0.1:3002 node --test backend/test/parity.test.js
```

## 部署

```bash
cp deploy/.env.example deploy/.env     # 填 API_KEY / TOKEN_MASTER_KEY / POSTGRES_PASSWORD
docker compose -f deploy/docker-compose.stack.yml --env-file deploy/.env up -d --build
curl http://localhost:8080/health
```

四个服务：`web`（nginx + 静态产物）、`api`、`worker`、`db`。

nginx 配置里 `/api/` 用变量 + `resolver` 反代到 `api:3002`。这样纯静态部署（不含后端）时 nginx 仍能启动，只是 `/api/*` 返回 502 —— 而不是因为 upstream 解析失败导致整个站点起不来。

`/api/hortor*`、`/api/weixin*`、`/api/proxy` 是原有登录代理，都比 `/api/` 更长或更精确，会先被匹配，不会被业务 API 吞掉。

## 已知边界

- **游戏服会话有时效**。实测一个 `connId` 为 7 天前的 Token：WebSocket 能建立（64 ms），但服务端 30–100 ms 内以 1006 关闭，且**不发任何消息也会被断** —— 这是握手后鉴权失败，不是报文格式问题。真实链路验证需要当前有效的凭证。
- **单 worker**。cron 不能多实例，advisory lock 是兜底；要横向扩 worker 需要先把调度改成「抢任务行锁」模型。
- **`user_storage` 目前是全局单用户**。引入 `users` 表后要改成 `(user_id, key)` 复合主键并开 RLS。
