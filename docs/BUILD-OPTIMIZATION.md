# 打包优化方案（已落地 P0–P2 + 后续路线）

> 目标：首屏别再下载 4.7 MB，产物可长缓存，部署侧能直接吐压缩体，体积退化能被 CI 拦住。
> 全部改动已通过 `npm run verify`（契约 → lint 零警告 → 140 条单测）。

## 0. 结果先看

| 指标 | 优化前 | 优化后 | 变化 |
|---|---:|---:|---:|
| 首屏 JS（gzip） | 1268.4 kB | **356.1 kB** | **-72%** |
| 首屏 JS（原始） | 4726.7 kB | **1190.0 kB** | -75% |
| 首屏 CSS（gzip） | 56.8 kB | **7.8 kB** | -86% |
| 全部 JS（gzip） | 1.79 MB | **1.00 MB** | -44% |
| 全部 CSS（gzip） | ~0.11 MB | 0.11 MB | 持平（只是从首屏挪到路由） |
| 单 chunk 最大 | 4726.7 kB（一个 chunk 全包） | 876.1 kB（`vendor-naive`） | 可缓存、可并行 |
| `vite build` 耗时 | 15.2 s | **~10 s** | -34% |

首屏现在只加载 6 个文件：

```
vendor-naive     234.1 kB gz   naive-ui 按需组件 + vueuc/seemly/css-render
vendor-vue        42.7 kB gz   vue / vue-router / pinia / vueuse
index (entry)     32.2 kB gz   应用入口 + 路由表
vendor-crypto     27.8 kB gz   lz4js + crypto-js（BON 协议要用，跑不掉）
vendor-misc       19.3 kB gz   axios / p-queue / idb
index.css          7.8 kB gz   全局样式（arco 组件样式已按路由分发）
```

## 1. 诊断：4.7 MB 是谁

拆开原来的 `index-*.js` 逐项指纹对得上：

| 来源 | 体积 | 为什么会进首屏 |
|---|---:|---|
| `src/xyzw/**`（cocos 引擎 1.78 MB + `index.js` 2.39 MB） | ~4.1 MB | `index.html` 三段 `<script type="module">`，所有页面无条件加载 |
| `xlsx`（SheetJS） | ~700 kB | `router/index.js` → `clubBattleUtils.js` → `import * as XLSX` |
| `moment` | ~70 kB | `stores/events/study.ts` → `utils/base.ts`（只为 1 个 `isInCurrentWeek`） |
| `naive-ui` 全量 | ~1.1 MB | `app.use(naive)` 全局注册整套组件库 |
| `arco.css` 全量 | 468 kB | `main.js` 直接 `import "@arco-design/web-vue/dist/arco.css"` |

也就是说：**首屏 96% 的体积跟首屏功能无关**。

## 2. P0 — 游戏运行时移出首屏（最大头）

问题：`src/xyzw/**` 是原样搬运的游戏产物（`AGENTS.md` 明令不改），但它是被 `index.html` 硬挂的，
任何人打开首页都要先解析执行 4 MB 才能看到 Vue 挂载。

关键判断：这堆东西在应用侧只有**一个**真实用途 ——
`window.__require("13")` 拿加密模块生成登录 bin / 拉角色列表，出现在 3 个文件里：

- `src/views/TokenImport/MobileTokenForm.vue`
- `src/views/TokenImport/WxQrcodeForm.vue`
- `src/utils/wechatForceLogout.ts`

改法：

1. `index.html` 删掉三段脚本（保留注释指向新加载器）。
2. 新增 `src/utils/gameRuntime.js`：
   - `ensureGameRuntime()`：按 `cocos2d-js-min → game-defines → index` 顺序动态插 `<script>`，
     并发共享同一个 Promise，失败可重试；
   - `prefetchGameRuntime()`：`requestIdleCallback` 空闲预取，不阻塞渲染；
   - `getGameCryptoModule()`：同步取模块，未就绪时抛原来的可读报错。
3. 三个使用点改成「先 await 再取」，行为不变，只是从"开机就绪"变成"点登录时保证就绪"。
   `TokenImport.vue` 在 `onMounted` 里 `prefetchGameRuntime()`，用户点按钮前基本已经加载完。
4. `vite.config.js` 两个插件：
   - `emit-game-runtime`（build）：把三个文件**原样**拷到 `dist/game-runtime/`，不进 rollup 依赖图；
   - `game-runtime-dev`（serve）：dev 直接吐 `src/xyzw` 原始文件。
     （走 Vite transform 会塞 inline sourcemap，1.78 MB 变 12 MB。）

前提已验证：三个文件都不含 `import.meta` / `export` / 顶层 `await`，`node --check` 全部通过，
可以安全当经典脚本注入（原来是 `type="module"`，但它们本来就把结果挂在 `window` 上）。

配套测试：`test/gameRuntime.test.js`（5 条）——顺序注入、并发去重、已就绪跳过、失败重试、未加载报错。

## 3. P1 — 把跟首屏无关的依赖拆出去

**xlsx（~700 kB）**：路由守卫只要一个 `isNowInLegionWarTime()`，不该顺带把 Excel 库拖进来。

- 新增 `src/utils/legionWarTime.js`（函数原样搬过去）；
- `clubBattleUtils.js` 用 `export { isNowInLegionWarTime } from "./legionWarTime.js"` 保留同名导出（契约不断）；
- `router/index.js` 改指轻模块。

**moment（~70 kB）**：`utils/base.ts` 里只有 `isInCurrentWeek()` 用到它。
改成原生 `Date` 算「本周一 00:00」时间戳对比，语义一致，整包 moment 从产物里消失。

**naive-ui 全量注册**：`main.js` 去掉 `app.use(naive)`，
改由 `unplugin-vue-components` 的 `NaiveUiResolver` 按模板里出现的 `<n-*>` 自动按需引入。
已静态校验：全仓 214 处 `<n-*>`、49 种组件，100% 命中 naive-ui 导出，不存在漏注册。

**依赖分包**（`manualChunks`）：vue 系 / naive 系 / crypto / misc / xlsx / html2canvas 各自成 chunk，
名字稳定 → CDN 长缓存，改业务代码不会让用户重下整个库。

## 4. P2 — 样式与产物形态

**arco 样式按需**：`ArcoResolver({ importStyle: "css" })` 替换 `importStyle: false`，
`main.js` 不再全量 `import arco.css`（468 kB）。

- 首屏 CSS：56.8 kB gz → **7.8 kB gz**；
- 组件样式跟着用到它的路由 chunk 走（12 个 arco 样式 chunk）；
- 顺带好处：不再固定分包 arco，`index.html` 也就不再 `modulepreload` 它的 JS（省 98 kB gz 首屏）。

**预压缩**：`precompress` 插件给所有 >1 kB 的 js/css/html/json/svg 生成 `.gz` 与 `.br`
（11.33 MB → gzip 2.33 MB / brotli 1.96 MB），部署侧开 `gzip_static` 即可零 CPU 直接吐。

**部署配置**：`deploy/nginx.conf` 加 `gzip_static on;` + `/game-runtime/` 的短缓存策略
（文件名不带 hash，靠 ETag 协商）。

**体积门禁**：新增 `npm run check:bundle`（`scripts/check-bundle-size.mjs`），
只统计 `index.html` 真正引用的首屏资源，超预算退出码 1：

```
JS 合计  356.1 kB / 预算 450.0 kB
CSS 合计   7.8 kB / 预算  60.0 kB
✅ 首屏体积在预算内
```

丢进 CI 就没人能悄悄把 4 MB 塞回首屏。

## 5. 后续路线（按性价比排序）

| 阶段 | 动作 | 预期收益 | 风险 |
|---|---|---|---|
| N1 | `clubBattleUtils` / `clubWarrankUtils` / `goldWarrankUtils` / `LegionWarStatistics.vue` 里把 `import * as XLSX` 改成函数内 `await import("xlsx")`，调用方 `await` | `GameFeatures` 849 kB → ~560 kB（省 ~95 kB gz），xlsx 变成真正点击导出才下 | 低：导出函数变 async，需逐个确认调用点不吃返回值 |
| N2 | 19 个 Club/cards 组件里的 `import html2canvas` 收口成 `utils/snapshot.js` 异步版 | 首屏无关，但 Club 路由少下 202 kB | 中：调用点都是 `async` 导出流程，改完要手动点一遍导出按钮 |
| N3 | `vendor-naive`（234 kB gz）是现在首屏最大单块：按页面用到的组件评估能否用 arco 替代，或把 `<n-*-provider>` 之外的部分挪到布局层懒加载 | 首屏最多再砍 ~100–150 kB gz | 中高：涉及组件替换，得配页面级验收 |
| N4 | 资源瘦身：`public/icons/grayRockMap.png` 3.68 MB（`src/` 里无人引用）、`public/game/` 3.1 MB 与 `dist/game-runtime/` 3.97 MB 是**同一套引擎的两份拷贝** | 发布体积 -4~6 MB | 低（前者直接删或转 webp），后者需要确认 iframe 里的游戏页能否复用 game-runtime |
| N5 | CF Pages 加 `_headers`：`/assets/*` immutable 一年、`/index.html` no-store、`/game-runtime/*` 1 小时 | 二次访问几乎全命中缓存 | 低 |
| N6 | `build.modulePreload.polyfill: false`（目标浏览器都支持） | 首屏再 -1 kB | 低 |

## 6. 验收清单

```bash
npm run verify        # 契约 + lint 零警告 + 单测（当前 140 条全绿）
npm run verify:full   # 再加生产构建
npm run check:bundle  # 首屏体积预算
```

人工过一遍（改动涉及的可见面）：

1. `/tokens` 页 →「手机号登录」发验证码 → 登录成功、能拿到角色列表（走的就是新加载器）；
2. `/tokens` 页 → 微信扫码成功 → 生成 bin；
3. `/tokens` 页 → 账号列表「下载 BIN」；
4. 用了 `<a-*>` 组件的 23 个页面（Dashboard / DailyTasks / GameRoles / Profile / Club 系）样式无缺；
5. `/game` 与 `/multi-game` iframe 正常（`public/game` 未动）。

## 7. 回滚

改动都是分层的，按需回退：

- 只想恢复游戏运行时的原样加载：把 `index.html` 三段脚本加回去（`ensureGameRuntime()` 检测到
  `window.__require` 已存在会直接跳过，不会重复加载）。
- 只想恢复 naive 全量注册：`main.js` 加回 `import naive from "naive-ui"` + `app.use(naive)`。
- 只想恢复 arco 全量样式：`ArcoResolver({ importStyle: false })` + `main.js` 加回
  `import "@arco-design/web-vue/dist/arco.css"`。

## 8. 改动文件清单

新增：

- `src/utils/gameRuntime.js`
- `src/utils/legionWarTime.js`
- `scripts/check-bundle-size.mjs`
- `test/gameRuntime.test.js`
- `docs/BUILD-OPTIMIZATION.md`

修改：

- `index.html`（移出游戏运行时脚本）
- `vite.config.js`（emit-game-runtime / game-runtime-dev / precompress / manualChunks / NaiveUiResolver / build 配置）
- `src/main.js`（去 naive 全量注册、去 arco 全量样式）
- `src/utils/base.ts`（去 moment）
- `src/utils/clubBattleUtils.js`（`isNowInLegionWarTime` 改 re-export）
- `src/router/index.js`（守卫改指 `utils/legionWarTime`）
- `src/views/TokenImport/TokenImport.vue`、`MobileTokenForm.vue`、`WxQrcodeForm.vue`、`src/utils/wechatForceLogout.ts`（await 运行时）
- `deploy/nginx.conf`（`gzip_static` + `/game-runtime/` 缓存）
- `package.json`（新增 `check:bundle` 脚本）
