# render-backend（已废弃，仅作对拍基准）

**不要在这里加功能，也不要把它部署上线。**

这个目录是早期 Express + Supabase 的半成品后端，已被 `backend/`（Fastify 5 + pg）取代。
保留它的唯一理由是**一致性证据**：

`backend/scripts/supabase-shim.js` 用 module resolve hook 把 `@supabase/supabase-js`
重定向到本地 pg 实现，于是这里的 `server.js` **一行未改**就能跑在本地 Postgres 上，
给 `backend/test/fixtures/baseline.original.json` 产出基准，再由
`backend/test/parity.test.js` 逐字节对拍新实现。

## 处置约定

| 想做的事 | 该去哪 |
|---|---|
| 改后端 API / 任务调度 / Token 加密 | `backend/` |
| 加新的对拍用例 | `backend/scripts/capture-baseline.mjs` + 重新生成 fixture |
| 删这个目录 | 先把 `test/fixtures/baseline.original.json` 与 `backend/scripts/parity-core.mjs` 的自足性确认掉，再走 `docs/OPEN-CLOSED-RULES.md` 的破坏性变更流程 |

## 依赖

不参与根 workspace（它有自己的一份 `pnpm-lock.yaml`），只在复现对拍时按需安装：

```bash
pnpm --dir render-backend install
node --import ./backend/scripts/register-shim.mjs render-backend/server.js
```
