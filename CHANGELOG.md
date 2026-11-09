# 更新日志

## [Unreleased] - 2026-11-09 · 工程规范化

> 主题：把「可选后端」纳入既有工程纪律。功能行为不变，改变的是**边界、单源与闸门**。

### 🔒 存储单通道（破坏性收敛）

- 新增 `src/composables/usePersistentRef.ts`，`tokenStore.ts` 的 6 个键
  （`gameTokens` / `selectedTokenId` / `selectedRoleInfo` / `activeConnections` /
  `tokenGroups` / `ws_connection_*`）、`stores/common.ts`、`stores/events/chat.ts`
  **全部从 VueUse `useLocalStorage` 迁出**。
  原因：两条写入通道并存时，facade 的内存镜像读不到直写，云同步在最核心的
  `gameTokens` 上**静默失效**。
- `src/api/storage.js`：新增订阅广播 `subscribe()`、按 `updatedAt` 的启动合并、
  内部写入时间戳键 `__storageLastWriteAt`（不上云、不出现在 `snapshot/key/length`）。
- 多开流程（`TokenImport.vue` / `GameMultiPlayer.vue`）改用 facade 写入；
  `multi-game:*` 进「不推云端但入镜像」名单。
- 迁移零成本：键名、序列化格式与存量数据完全兼容。

### 🔗 协议单源门禁

- 新增 `test/protocolParity.test.js`：前后端 BON **明文字节逐字节一致**、
  `lx/x/xtm` 三通道密文互通、并显式记录后端副本缺失
  `ProtoMsgLegion` / `GameMessages`（后端副本与 `render-backend/lib/bonProtocol.js`
  的 MD5 相同，已落后前端 254 行）。
- 长期目标：抽共享包后删副本；在此之前该测试就是唯一一致性证据。

### 🚦 闸门补齐

- 契约校验新增 `--strict`（**新增未固化也算失败**）、`CURATED_FILES`/`EXPORT_MODULES`
  纳入 `src/api/*` 与后端关键文件、存储键扫描补 `usePersistentRef`、脚本与依赖改双向比对。
- `npm run lint` 覆盖 `backend/`（恢复 49 个先前无人检查的问题，零警告通过）。
- 新增 `scripts/verify-all.mjs`（本地等价 CI）与 `.github/workflows/verify.yml`
  （此前 CI 文件放在 `docs/ci/` 规避 token scope，**从未真正运行**）。
- `pnpm-workspace.yaml`（根 + `backend`），删除 `backend/pnpm-lock.yaml`，一次 `pnpm install` 装两边。

### 🐛 修复

- 云端合并不再无条件覆盖本地：带 `updatedAt` 时按时间先后判定，
  旧后端不带时间戳则保留本地并回传，**不再静默丢本地写入**。
- `/api/storage/all` 与 `/api/storage/:key` 返回 `{ value, updatedAt }`，
  前端据此判断「另一台设备是否更新过」。
- `NEVER_SYNC` 语义澄清：只表示不推云端，这些键**仍然进镜像**，
  避免 `storage.getItem` 与 `localStorage` 不一致。
- 删除死代码：`storage.js` 未使用的 `PREFIX`、`supabase-shim.js` 未使用的 `OPS` 表。

### 📚 文档

- `CLAUDE.md` 从 33KB 收敛为导航指针（原有过期 API 已移除），
  `AGENTS.md` 增补「四条新约定 + 目录职责」，`docs/OPEN-CLOSED-RULES.md`
  记录 6 条变更与三条新红线，`PROJECT-OVERVIEW` / `BACKEND` / `REGRESSION-CHECKLIST` 同步基线。
- `render-backend/README.md` 标明已废弃、仅作对拍基准。

### ✅ 验证

`node scripts/verify-all.mjs` → 契约(strict) / lint(含 backend) / 前端单测 220 /
构建 / 产物预算 / 后端单测 73，全部通过。

## [2.0.0] - 2024-01-20

### 🎉 重大更新 - Token管理系统重构

#### ✨ 新增功能
- **Base64 Token导入**: 支持多种格式的Base64编码Token解析
- **可视化Token管理**: 名称-Token列表形式管理多个游戏角色
- **WebSocket连接管理**: 自动建立和监控WebSocket连接状态
- **批量操作功能**: 导入/导出、清理过期Token等批量功能
- **响应式Token界面**: 完美适配桌面和移动设备的Token管理界面

#### 🗑️ 移除功能
- **登录注册系统**: 完全移除传统的用户认证流程
- **用户管理**: 不再需要用户账户系统
- **API依赖**: 移除所有后端接口依赖

#### 🔄 重大变更
- **入口页面**: 从登录页面改为Token导入页面 (`/tokens`)
- **路由结构**: 重构路由，旧路由自动重定向到Token管理
- **数据结构**: 全新的Token数据结构，支持自定义名称和完整信息
- **访问控制**: 基于Token存在性而非用户认证状态

#### 🛠️ 技术改进
- **本地存储**: 所有数据完全本地化存储
- **智能解析**: 自动识别和解析各种Base64格式
- **连接监控**: 实时WebSocket连接状态显示
- **容错处理**: 完善的错误处理和用户提示

#### 📱 用户体验
- **简化流程**: 无需注册登录，直接导入Token使用
- **直观管理**: 卡片式Token列表，状态一目了然
- **快速操作**: 一键选择、连接、管理Token
- **数据安全**: 本地存储，Token信息脱敏显示

---

## [1.x.x] - 历史版本

### 特性
- 基于用户认证的传统系统
- API接口依赖的数据管理
- 游戏角色CRUD操作
- 日常任务管理功能

---

## 升级指南

### 从1.x版本升级到2.0
1. **数据迁移**: 
   - 导出现有游戏角色数据
   - 获取每个角色对应的Token
   - 将Token转换为Base64格式后导入新系统

2. **使用变更**:
   - 不再需要注册登录
   - 直接访问 `/tokens` 页面导入Token
   - 通过Token名称管理多个游戏角色

3. **功能对照**:
   - 游戏角色管理 → Token管理
   - 用户认证 → Token导入
   - 角色选择 → Token选择

### 兼容性说明
- 旧版本路由会自动重定向到新系统
- 本地存储数据需要手动迁移
- WebSocket连接方式保持兼容