# CI 说明

提交闸门是 `.github/workflows/verify.yml`（唯一权威文件，**不要在这里再放一份 YAML**，
两份会漂移）。本目录只保留这份说明。

## 为什么不放在 docs/ 而放到 .github/

推送 `.github/workflows/**` 需要 token 具备 `workflow` scope。历史上因为凭证没有该
scope，作者把 YAML 放在 `docs/ci/` 规避 push 失败，导致 **CI 从未真正运行过**。
现在文件已放到正确位置：

```bash
gh auth refresh -s workflow        # 补 scope
git add .github/workflows/verify.yml
git commit -m "ci: 启用提交闸门"
git push
```

若 push 仍被拒，在 GitHub 网页端 Actions → New workflow 粘贴
`.github/workflows/verify.yml` 的内容即可，效果相同。

## 本地等价

```bash
node scripts/verify-all.mjs          # 契约 + lint + 前端单测 + 构建 + 产物预算 + 后端单测
node scripts/verify-all.mjs --fast   # 跳过构建与后端（只做契约 + lint + 单测）
```

## 两个 job 的分工

| job | 内容 | 失败含义 |
|---|---|---|
| frontend | `check:arch:strict` → `lint` → `test` → `build` → `check:bundle` | 契约被破坏 / 代码规范 / 单测 / 构建体积 |
| backend | 起 Postgres → 建表 → `test:backend` | 后端逻辑或 SQL 变更 |

`check:arch:strict` 比默认模式严格：**新增**路由/存储键/导出/代理前缀也必须先
`node scripts/check-architecture.mjs --update` 固化进基线，否则 CI 红。
