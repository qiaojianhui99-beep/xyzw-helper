# 回归验证清单

> 目的：改完代码，用**固定动作**证明「旧功能还在」。分三级，按改动大小选。
> 所有命令在项目根目录执行。

---

## L0 · 自动闸门（每次提交必跑）

```bash
node scripts/verify-all.mjs      # 本地等价 CI：契约 → lint → 前端单测 → 构建 → 产物预算 → 后端单测
node scripts/verify-all.mjs --fast   # 只做契约 + lint + 前端单测
npm run verify                   # 契约(--strict) + lint + 前端单测（快速门）
npm run verify:full              # 再加生产构建与产物预算
```

| 检查 | 命令 | 通过标准 |
|---|---|---|
| 架构契约 | `npm run check:arch:strict` | 打印 `✅ 架构契约校验通过`，且**无新增未固化**项 |
| 代码规范 | `npm run lint` | 退出码 0，零警告（范围含 `backend/`） |
| 前端单测 | `npm test` | `fail 0`（当前基线 **220** 项） |
| 后端单测 | `npm run test:backend` | `fail 0`（当前基线 **73** 项；需 `npm run db:up`） |
| 生产构建 | `npm run build` | `✓ built in …`，`dist/_worker.js` 已生成 |
| 产物体积 | `npm run check:bundle` | 未超预算 |

**三条新增门禁（2026-11）**，改到对应区域时必跑：

| 门禁 | 测试 | 守什么 |
|---|---|---|
| 存储单通道 | `node --test test/storageChannel.test.js` | 镜像与 localStorage 不分叉；云合并按 `updatedAt` |
| 协议一致性 | `node --test test/protocolParity.test.js` | 前后端 BON 编码逐字节一致、三通道密文互通 |
| 契约 strict | `npm run check:arch:strict` | 新增路由/存储键/导出/代理/脚本也必须固化进基线 |

**红灯处理**：先看是不是自己删/改了契约项。是 → 按 `docs/OPEN-CLOSED-RULES.md` 第 5 节走变更流程；不是 → 修代码，别改基线。

---

## L1 · 冒烟手测（改 UI / 连接 / 任务时）

启动：`npm run dev` → http://localhost:3000

### 1. 页面可达性

| 检查 | 期望 |
|---|---|
| `/` | 首页正常渲染，无白屏 |
| `/tokens` | Token 管理页，五种导入 tab 可见（手动 / bin / 单 bin / URL / 微信扫码 / 手机号） |
| 直接访问 `/admin/dashboard`（无 Token） | 被重定向到 `/tokens` |
| 导入一个 Token 后访问 `/admin/*` | 正常进入布局页 |
| `/game`、`/multi-game` | iframe 加载游戏，控制台无致命报错 |
| 随便敲 `/not-exist` | 落到 NotFound 页 |
| 浏览器控制台 | 无未捕获异常、无 Vue warn 洪泛 |

### 2. Token 生命周期

| 步骤 | 期望 | 观察点 |
|---|---|---|
| 手动粘贴合法 Base64 | 解析成功，列表出现一条，名称/服务器正确 | `localStorage.gameTokens` |
| 粘贴 `token:xxx` 前缀格式 | 同上 | 同上 |
| 粘贴非法串 | 明确报错提示，不写入 | 列表不变 |
| 刷新页面 | Token 仍在，选中项仍选中 | `selectedTokenId` |
| 删除 Token | 列表移除，对应连接断开 | `wsConnections` 里无残留 |
| 分组增删改 / 移入移出 | 分组状态正确 | `tokenGroups` |

### 3. 连接与协议

| 步骤 | 期望 | 观察点 |
|---|---|---|
| 选中 Token 建连 | 状态变 `connected`，日志出现心跳 | DevTools → Network → WS 帧；`wsConnections[id].status` |
| 发 `role_getroleinfo` | 收到角色信息，`gameData.roleInfo` 更新 | Console + Pinia 面板 |
| 断网 / 手动关服务 | 状态转 `error`/`disconnected`，按退避重连 | 日志有 `reconnect` |
| 主动断开 | 不再重连（区别于异常断开） | 日志无重连 |
| 同一 Token 重复建连 | 被锁拦住，提示重复 | `connectionLocks` / `activeConnections` |
| 开第二个标签页 | 不会重复占用连接 | `localStorage.activeConnections` |

### 4. 日常任务（单账号）

入口：`/admin/daily-tasks`

| 检查 | 期望 |
|---|---|
| 触发签到 / 领日常 / 挂机领取 | 每条步骤有日志，失败不崩整轮 |
| 中途断线 | 该步失败并记录，后续步骤按策略继续或中止（不静默） |
| 完成后 | `dailyTaskState` 记录当天状态，重复触发有锁 |
| 关闭页面后重进 | 状态一致，不重复领奖 |

### 5. 批量托管（多账号）

入口：`/admin/batch-daily-tasks`

| 检查 | 期望 |
|---|---|
| 勾选 3+ 账号并启动 | 并发不超过 `maxActive`（默认 2），其余排队 |
| 队列日志 | 出现 `队列: n/2` 形态 |
| 单个账号失败 | 其他账号继续，失败账号有独立错误日志 |
| 停止按钮 | 全部连接释放，`connectionQueue.active` 归零 |
| 定时任务 | 到点触发；未知任务 id 不执行且报错清晰 |

### 6. 其它页面

| 页面 | 重点 |
|---|---|
| `/admin/dashboard` | 角色卡片、战力/资源数值渲染，刷新不报错 |
| `/admin/game-features` | 各功能卡片可点，切换不白屏（此 chunk 较大，注意首屏） |
| `/admin/legion-war` | 军团战/盐场时段判断正确，非时段有提示 |
| `/admin/PushingLevels` | 关卡列表与编队数据加载 |
| `/admin/message-test` | 手动构造报文发送成功，编码结果可读 |
| `/websocket-test` | 连接/断开按钮生效 |
| `/admin/profile` | 设置项持久化，刷新后保留 |
| 主题切换 | 明/暗切换即时生效，刷新后保持 |

### 7. 存储与数据

| 检查 | 期望 |
|---|---|
| 刷新页面 | 所有设置保留（`theme`、`batchSettings`、`tokenSortConfig` 等） |
| 导出 Token | 文件下载，内容含全部账号 |
| 重新导入导出文件 | 数量与字段一致 |
| 清空 Token | 列表清空、连接释放、localStorage 对应键被清 |

---

## L2 · 真机只读验证（改协议 / 改命令时）

涉及真实服务端行为，只能实测，**只读优先**：

1. 用测试账号导入 Token（不要用主号首次验证）。
2. 只发读命令（`role_getroleinfo`、`system_getdatabundlever`、`*_getinfo`）。
3. 对照游戏客户端真实界面数值，确认解析字段没错位。
4. 写命令（领奖、购买、编队）先在测试号跑一次，确认不重复扣资源。
5. 记录结论到 `docs/live-validation-<日期>.md`（格式参考既有文件）。

⚠️ 读命令安全，写命令**可能产生不可逆的游戏内后果**，务必小号。

---

## 改动类型 → 必跑项（矩阵）

| 改动内容 | L0 | L1 必测段 | L2 |
|---|---|---|---|
| 纯文案 / 样式 | verify | 对应页面 | — |
| 新增页面 | verify:full | 1（含新页面） | — |
| 改 `router/index.js` | verify | 1 全部 | — |
| 改 `tokenStore` | verify:full | 2、3、7 | — |
| 改 `bonProtocol` / `xyzwWebSocket` | verify:full | 3 全部 | ✅ 必做 |
| 改 `registerDefaultCommands` | verify:full | 3 对应命令 | ✅ 读写各一次 |
| 改 `dailyTaskRunner` / `dailyTaskState` | verify | 4 | 视情况 |
| 改 `batch/*` | verify | 5 全部 | 视情况 |
| 改 `vite.config.js` / 依赖 | verify:full | 1、3 | — |
| 改 `localStorage` 键 | verify | 7 全部 | — |
| 改 `render-backend/` | `npm run lint` + 手动起服务 | 3 | ✅ API Key 校验 |

---

## 合入前 Definition of Done

- [ ] `npm run verify` 全绿（改动涉及构建/依赖时用 `verify:full`）
- [ ] 契约新增项已 `npm run update:arch` 固化；删除项已在变更记录登记
- [ ] 对应 L1 段落逐条过完，并把「未覆盖的风险」写进 PR 描述
- [ ] 没有新增 `eslint-disable` / `test.skip` / 注释掉旧代码
- [ ] 没改 `src/xyzw/**`、`public/game/**`
- [ ] 文档同步：新领域补 `PROJECT-OVERVIEW.md`；协议补 `feature-protocol-dev-guide.md`；破坏性变更补 `OPEN-CLOSED-RULES.md` 变更记录

---

## 附：基线与常见红灯

| 现象 | 原因 | 处理 |
|---|---|---|
| `契约校验未通过：路由 path丢失` | 删/改了路由 | 恢复，或走变更流程 `--allow-removals` 并登记 |
| `默认参数被改动：maxActive 期望 2，实际 N` | 改了批量默认值 | 恢复默认；要改就登记并更新基线 |
| `导出被删除：xxx -> yyy` | 删了导出 | 恢复（可能有动态引用） |
| `localStorage 键丢失` | 改了键名 | 恢复旧键，新增新键 + 迁移 |
| `npm 脚本缺失` | 删了 `dev/build/test/lint` 等 | 恢复 |
| lint `--max-warnings 0` 失败 | 新增 JSDoc / 变量问题 | 修代码，别关规则 |
| build 成功但页面 404 | 新增路由路径大小写不一致 | 统一大小写（注意 `PushingLevels` 历史大写） |
