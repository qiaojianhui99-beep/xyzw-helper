# Design System Master — XYZW Console

> **读取顺序**：做某个页面时，先看 `design-system/xyzw-console/pages/<page>.md`；
> 存在则它的规则**覆盖**本文件；不存在就严格按本文件执行。

**项目**：XYZW Console（`xyzw-token-manager@2.0.0`）
**生成**：2026-10-25 · `ui-ux-pro-max` v2.1.x `--design-system --persist`（variance 4 / motion 4 / density 8）
**校准**：生成后按仓库真实 token（`src/assets/styles/variables.scss`）逐项校正；配色、字号、间距以代码为准，
规则与反模式沿用技能数据。**被替换掉的部分见文末「生成器 vs 本文件」。**
**适用范围**：`src/views/**` 全部页面、`src/components/**` 全部组件、`layout/DefaultLayout.vue`。

---

## 0. 三条铁律

1. **只有一个强调色。** 品牌色 = `--color-accent`（light `#2b54d4` / dark `#3b63e0`）。
   历史品牌 `#667eea → #764ba2`（靛→紫渐变）**已废弃**：禁用紫色/靛蓝渐变、禁用第二个强调色。
   状态色（success / warning / danger / info）只表达语义，不承担品牌。
2. **双主题等价。** 每个页面必须在 light 与 dark 下都成立：`[data-theme="dark"]` 覆盖的只是中性色，
   任何"只在白底好看"的颜色都不合格。
3. **状态不靠颜色单独传达。** 运行/成功/警告/失败/排队必须"颜色 + 图标 + 文本"三者至少两个。

---

## 1. 颜色

**唯一来源：`src/assets/styles/tokens.scss`。** 下表是它当前的值，改配色只改那个文件。

### 1.1 浅色主题（`:root`）

| 角色 | 值 | 变量 | 实测对比度 |
|---|---|---|---|
| 页面背景 | `#e9edf2` | `--color-bg` | — |
| 卡片/面板 | `#ffffff` | `--color-surface` | 对页面 1.18:1（配描边+阴影分层） |
| 浮层/弹窗 | `#ffffff` | `--color-surface-raised` | 同上，靠 1px 描边（1.35:1）+ lg 阴影 |
| 表头/斑马纹 | `#f3f5f8` | `--color-surface-muted` | 对卡片 1.09:1 |
| 悬停表面 | `#edf1f6` | `--color-surface-hover` | 对卡片 1.13:1 |
| 正文 | `#14181f` | `--color-text-primary` | 17.79:1 ✅ |
| 次要文字 | `#4a5563` | `--color-text-secondary` | 7.58:1 ✅ |
| 弱化文字 | `#5f6975` | `--color-text-muted` | 5.58:1 ✅ |
| 禁用文字 | `#9aa3af` | `--color-text-disabled` | 2.55:1（WCAG 禁用态豁免） |
| 描边 | `#d8dee7` | `--color-border` | 装饰性分隔 |
| 控件描边 | `#8a929f` | `--color-border-strong` | 3.14:1 ✅ |
| 强调色 | `#2b54d4` | `--color-accent` | 白字 6.32:1 ✅ |
| 强调色 hover | `#1f41ac` | `--color-accent-hover` | 白字 8.71:1 ✅ |
| 强调色 active | `#17327f` | `--color-accent-active` | 白字 11.67:1 ✅ |
| 强调色上的文字 | `#ffffff` | `--color-accent-text` | — |
| 强调色浅底 | `#e7ecfb` | `--color-accent-soft` | 链接字 6.3:1 ✅ |
| 链接 | `#2b54d4` | `--color-link` | 6.32:1 ✅ |
| 图标 | `#4a5563` | `--color-icon` | 7.58:1 ✅ |
| 遮罩 | `rgba(13,17,23,.55)` | `--color-overlay` | — |
| 成功 | `#0a7a4c` / 字 `#0a6b45` | `--color-success` / `-text` | 字 6.56:1 ✅ |
| 警告 | `#b45309` / 字 `#8a5200` | `--color-warning` / `-text` | 字 6.39:1 ✅ |
| 失败 | `#c83a52` / 字 `#b32641` | `--color-danger` / `-text` | 字 6.42:1 ✅ |
| 信息 | `#1a5fbd` | `--color-info` / `-text` | 6.15:1 ✅ |
| 名次徽章文字 | `#1c1605` | `--color-rank-text` | 金/银/铜底上的深字 |

### 1.2 深色主题（`html[data-theme="dark"], html.dark`）

| 角色 | 值 | 变量 | 实测对比度 |
|---|---|---|---|
| 页面背景 | `#0d0f13`（带色调近黑） | `--color-bg` | — |
| 卡片/面板 | `#181c24` | `--color-surface` | 对页面 1.12:1 + 描边 |
| 浮层/弹窗 | `#222833`（**比卡片亮**，深色分层靠它） | `--color-surface-raised` | 对卡片 1.15:1 |
| 表头/斑马纹 | `#1e232c` | `--color-surface-muted` | 1.08:1 |
| 正文 | `#e9ecf2` | `--color-text-primary` | 14.42:1 ✅ |
| 次要文字 | `#a9b3c1` | `--color-text-secondary` | 8.05:1 ✅ |
| 弱化文字 | `#8f99a8` | `--color-text-muted` | 5.92:1 ✅ |
| 禁用文字 | `#5b6472` | `--color-text-disabled` | 2.85:1（豁免） |
| 描边 | `#2c333f` / 控件 `#616a79` | `--color-border` / `-strong` | 控件 3.13:1 ✅ |
| 强调色 | `#3b63e0` | `--color-accent` | 白字 5.19:1 ✅，对表面 3.29:1 ✅ |
| 强调色 hover | `#4a6fe0` | `--color-accent-hover` | 白字 4.52:1 ✅ |
| 强调色 active | `#2f52c4` | `--color-accent-active` | 白字 6.72:1 ✅ |
| 链接 | `#9cb4ff` | `--color-link` | 8.44:1 ✅ |
| 图标 | `#a9b3c1` | `--color-icon` | 8.05:1 ✅ |
| 成功/警告/失败/信息（文字） | `#4ade80` / `#fbbf24` / `#f87171` / `#93c5fd` | `-text` | 7.3 / 7.57 / 5.04 / 7.02 ✅ |

> 完整 31 场景 × 2 主题 = 62 项实测表见 `CONTRAST-REPORT.md`（`python3 scripts/ui/verify-contrast.py` 生成）。

### 1.3 渐变

只允许「同色系」渐变（如 `accent → accent-hover`），且只用于图标/进度条/名次徽章。
**禁止**：紫色/靛蓝渐变、大面积内容卡渐变底、表格渐变底。

### 1.4 兼容别名（不要在新代码里用）

`--primary-color` / `--text-primary` / `--bg-primary` / `--border-light` / `--success-color` …
等 40+ 个历史 token 名在 `tokens.scss` 末尾统一指向新 `--color-*`，
所以老组件不改一行也跟随双主题。新代码一律写 `--color-*`。

## 2. 字体

```scss
$font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC",
            "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
$font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
```

| 用途 | 字体 | 说明 |
|---|---|---|
| 正文 / UI | `$font-sans` | 保持系统栈，**不要引入 Google Fonts**（中文回退会变丑、首屏变慢） |
| 数值 / Token / 日志 / 计时 | `$font-mono` + `font-variant-numeric: tabular-nums` | 数字列必须等宽，否则跳列 |
| 标题 | `$font-sans` 600/700 | 不额外加 letter-spacing（会拉散中文） |

| Token | 值 | 用途 |
|---|---|---|
| `--font-size-xs` | 12px | 徽章、辅助说明（不用于正文） |
| `--font-size-sm` | 14px | 表格正文、日志 |
| `--font-size-md` | 16px | 默认正文与输入（移动端键盘缩放阈值） |
| `--font-size-lg` | 18px | 卡片标题 |
| `--font-size-xl` | 20px | 区块标题 |
| `--font-size-2xl` | 24px | 页面标题 |
| `--font-size-3xl` | 32px | 首页 hero |

行高：正文 1.5；标题 1.25；表格单元 1.4。字重仅用 300/400/500/700。

**Token 显示规则**：脱敏展示首尾各 4 位（`abcd…wxyz`），等宽字体，中间省略，`title` 属性给全文，禁止整串平铺。

---

## 3. 间距 / 圆角 / 阴影 / 层级

| 类别 | 值 | 说明 |
|---|---|---|
| 间距 | `4 / 8 / 16 / 24 / 32 / 48`（`--spacing-xs…2xl`） | 密集表格内部允许 4/8/12；卡片 padding 16–24 |
| 圆角 | `4 / 8 / 12 / 16`（`--border-radius-small…xl`） | 按钮 8、卡片 12、弹窗 16、徽章 4 或全圆角 |
| 阴影 | `--shadow-light` / `-medium` / `-heavy` | 暗色下透明度 ×1.5，或改用 1px 边框替代阴影 |
| 层级 | nav 100 / dropdown 200 / modal 1000 / toast 1100 | 直接沿用 Naive UI 默认，不要新造 |

页面容器：内容区最大宽 1440，左右 gutter 24（<768 时 16）；卡片间距 16；区块间距 32。

---

## 4. 组件规范

### 4.1 按钮

- 主操作整页 ≤1 个；批量页的"开始"用 primary，"停止"用 error 描边而非实心。
- 高度：`small 32 / medium 40 / large 48`；图标按钮 40×40（触屏最小 44×44 命中区，可用 padding 补足）。
- 纯图标按钮**必须**有 `aria-label` + tooltip；`cursor: pointer`；hover 150–200ms。
- 禁用态：`opacity: .5; cursor: not-allowed`，并给出原因（tooltip），不要静默禁用。

### 4.2 卡片

```scss
.card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-large);
  padding: 20px 24px;
  box-shadow: var(--shadow-light);
  transition: box-shadow 180ms ease, border-color 180ms ease;
}
.card:hover { box-shadow: var(--shadow-medium); } // 只提阴影，不位移
```

**禁止 `transform: translateY` 悬浮**：密集列表里会抖，且触屏无 hover。

### 4.3 表格（本项目最高频）

- 行高 40–44；表头 `--bg-tertiary` + 12–13px 次级文字；斑马纹用 `--bg-secondary`。
- 数字列右对齐 + `tabular-nums`；状态列用徽章；操作列固定右侧，超过 3 个动作收进"更多"。
- 超过 50 行必须分页或虚拟滚动（参见 `references/quick-reference.md` → `virtualize-lists`）。
- 空态：一句说明 + 一个主操作（"去导入 Token"），不要只显示"暂无数据"。

### 4.4 状态徽章

| 状态 | 浅色 | 深色 | 图标 |
|---|---|---|---|
| 运行中 / 成功 | 底 `#18a058` 15% + 文字 `#15803d` | 文字 `#4ade80` | ✓ |
| 排队 / 等待 | 底 `#9ca3af` 15% + 文字 `#6b7280` | 文字 `#9ca3af` | ⏱ |
| 警告 / 即将过期 | 底 `#f5a623` 15% + 文字 `#b45309` | 文字 `#fbbf24` | ! |
| 失败 / 断开 | 底 `#d03050` 12% + 文字 `#d03050` | 文字 `#f87171` | ✕ |

高度 22–24，圆角 4，左图标 14px + 文本 12px，水平 padding 8。

### 4.5 输入与表单

- label 常显（不要 placeholder 当标签）；必填标记在 label 后。
- 校验：错误信息紧贴字段下方，红色 + 图标；提交失败时滚动到第一个错误并聚焦。
- focus：`box-shadow: 0 0 0 3px rgba(102,126,234,.25)` + `border-color: var(--primary-color)`；
  **不要 `outline: none` 了事**。
- 长表单分组，每组 ≤7 个字段；危险操作二次确认（输入名称或勾选）。

### 4.6 弹窗 / 抽屉

- 宽度 ≤520（移动端 92vw）；标题 18/600；底部按钮右对齐，主操作在右。
- 遮罩 `rgba(0,0,0,.5)` + `backdrop-filter: blur(4px)`；打开时焦点进入弹窗，Esc 关闭，关闭后焦点回到触发元素。

### 4.7 日志与实时流

- 等宽 12–13px，时间戳 `tabular-nums` 且弱化（`--text-tertiary`）。
- 级别用左侧 3px 色条 + 级别文本，不只靠文字颜色。
- 自动滚动到底，但用户上滚时暂停并显示"回到底部"。
- 环形缓冲上限 `maxLogEntries`（默认 1000），超出丢弃最旧，**不要无上限追加**。

### 4.8 三态（必备）

每个数据区块都要有 **加载 / 空 / 错误**：
- 加载 >300ms 才显示 skeleton（避免闪烁），skeleton 尺寸与最终内容一致（CLS < 0.1）。
- 空态给下一步动作；错误态给"重试"与错误摘要，详细堆栈进日志不进 UI。

---

## 5. 动效

| 场景 | 时长 | 曲线 |
|---|---|---|
| 按钮/hover/焦点 | 150–200ms | `ease-out` |
| 展开收起、抽屉 | 240–300ms | 进入 `ease-out`，退出 `ease-in` |
| 列表首次载入 | 300–450ms，stagger 40–60ms | `ease-out`，**不要 `back.out` 弹跳**（数据 UI 会显得不严谨） |
| 状态切换（连接中→已连接） | 200ms | 颜色/透明度过渡，不缩放布局 |

**必须**：`@media (prefers-reduced-motion: reduce)` 下取消非必要动效并直接渲染终态；
动画只动 `transform` / `opacity`，不动 `width/height/top/left`；
标签页隐藏时停止轮询与动画（`document.hidden`）。

---

## 6. 可访问性

- 正文对比度 ≥4.5:1；大字（≥18.66px 粗体 / 24px）与图标 ≥3:1。第 1.4 节列出的不合格项必须按建议替换。
- 键盘可达：Tab 顺序符合视觉顺序；`focus-visible` 不可移除；Esc 关弹窗；方向键在表格/列表中可用。
- 触控目标 ≥44×44（桌面可 32，但需 8px 间隔）。
- 异步操作给 `aria-busy`；Toast 用 `aria-live="polite"`，错误用 `assertive`。
- 状态、图表序列不能只用颜色区分（加形状/标签/纹理）。
- 语言：`<html lang="zh-CN">`；表单错误用 `aria-describedby` 关联。

---

## 7. 反模式（不要做）

**技能数据给出的三条**：❌ 慢仪表盘 ❌ 装饰性图表 ❌ 隐藏错误状态。

**通用禁忌**：❌ emoji 当图标（本项目统一 `@vicons/ionicons5`）❌ 缺失 `cursor:pointer`
❌ hover 导致布局位移 ❌ 低对比文字 ❌ 状态 0ms 突变 ❌ 不可见焦点环。

**本项目特有**：

| ❌ 不要 | 为什么 | ✅ 改成 |
|---|---|---|
| 组件里写裸 hex | 换主题就散架 | `var(--text-primary)` 等 token |
| 引入第二套 UI 主题/设计系统 | Naive UI + Arco 已在跑，三套必打架 | 只用现有 token 与 `n-*` 组件 |
| 用 UnoCSS `btn-primary`（Tailwind blue） | 与品牌 `#667eea` 不一致 | 用 `n-button type="primary"` 或品牌 token |
| 卡片 hover `translateY` | 密集列表抖动 | 只改阴影/边框 |
| 表格里放渐变底 | 对比度下降 | 纯色表面 |
| 全量平铺 Token | 泄露 + 难读 | 首尾 4 位脱敏 + 等宽 |
| 默认隐藏错误 | 用户无法自救 | 就近显示 + 重试动作 |
| 无上限累积日志 | 内存与渲染双爆 | 环形缓冲（`maxLogEntries`） |

---

## 8. 交付前检查清单

- [ ] 浅色 + 深色都看过，文字对比度达标（第 1.4 节的 5 个坑没踩）
- [ ] 图标全部来自 `@vicons/ionicons5`，无 emoji
- [ ] 可点元素有 `cursor:pointer`、hover 态、`focus-visible` 环
- [ ] 纯图标按钮有 `aria-label`；表单 label 常显
- [ ] 加载/空/错误三态齐全；加载 >300ms 才出 skeleton
- [ ] 数字列右对齐 + `tabular-nums`；Token 脱敏
- [ ] `prefers-reduced-motion` 生效；隐藏标签页停止轮询
- [ ] 375 / 768 / 1024 / 1440 四个宽度无横向滚动、无内容被固定导航遮挡
- [ ] 长列表（>50 行）有分页或虚拟滚动；日志有上限
- [ ] 没有新增裸 hex、没有新增第二套主题变量

---

## 9. 仓库落地映射

| 设计 token | 代码位置 | 现有变量 |
|---|---|---|
| 品牌 / 状态 / 中性色 | `src/assets/styles/variables.scss` | `--primary-color`、`--success-color`、`--text-primary`… |
| 暗色覆盖 | 同文件 `[data-theme="dark"]` | 只覆盖中性色，品牌色不覆盖 |
| 响应式字号/间距 | 同文件 `@media (max-width:768px/640px)` | 字号与间距整体下调 |
| 全局基础样式 | `src/assets/styles/global.scss` | 重置、滚动条、通用类 |
| 主题切换 | `src/composables/useTheme.js` + `main.js` 的 `applyTheme()` | `localStorage.theme` = `light/dark/auto` |
| 组件库 | Naive UI（`n-*`，主力）+ Arco（`a-*`，少量） | 图标 `@vicons/ionicons5` |
| 页面样式 | 各 `*.vue` 的 `<style scoped lang="scss">` | 类名 kebab-case，按块命名（`.dashboard-main`） |

**推荐新增变量**（下一步改代码时加，不动现有语义）：`--success-text`、`--warning-text`、
`--info-text`、`--primary-text-dark`、`--success-text-dark`、`--warning-text-dark`、`--error-text-dark`、`--info-text-dark`。

---

## 10. 维护

- 页面级覆盖：`design-system/xyzw-console/pages/<page>.md`（存在即覆盖本文件）。
- 重新生成（**不要**加 `--force`，会覆盖本文件的校准结果）：

```bash
python3 "$HOME/.dsh/skills/ui-ux-pro-max/scripts/search.py" "<新关键词>" \
  --design-system --persist -p "XYZW Console" --output-dir "$(pwd)" \
  --variance 4 --motion 4 --density 8
```

- 若确实需要推倒重来：先 `cp design-system/xyzw-console/MASTER.md /tmp/MASTER.bak.md`，再显式 `--force`。
- 改本文件 = 改全局视觉契约。变更要登记：

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-10-25 | 初版：生成器输出按仓库 token 校准；补 5 条对比度缺陷与落地映射 | 建立全局视觉基准，防止后续页面风格漂移 |
| 2026-10-25 | **改版 v2**：废弃靛→紫渐变，收敛为唯一强调色 `#2b54d4`/`#3b63e0`；token 全部改为 light/dark 成对；新增 `surface-raised/muted/hover`、`-text` 状态字色、`--color-rank-text`；§1 全部数值以 `tokens.scss` 与 `CONTRAST-REPORT.md` 实测为准 | 用户改版要求：禁用紫色/靛蓝渐变、全站单一强调色、双主题可读性必须实测达标 |

---

## 附：生成器 vs 本文件

| 项 | 生成器原始输出 | 本文件 | 原因 |
|---|---|---|---|
| Primary | `#0F172A`（近黑） | `#667eea` | 仓库已有品牌，不能覆盖 |
| Accent | `#16A34A` | `#764ba2`（副色）+ 语义状态色 | 品牌是靛→紫双色 |
| Background | `#020617` | `#ffffff` / `#1f2937` | 仓库已有双主题表面 |
| Heading/Body | Fira Code / Fira Sans + Google Fonts | 系统栈 + 等宽仅用于数值 | 中文回退与首屏成本 |
| Spacing | 2/4/8/12/16/24/32 | 4/8/16/24/32/48 | 与 `variables.scss` 对齐，避免双套 |
| Component CSS | 通用 8px/24px 值 | 仓库 token + Naive UI 组合 | 落地即用 |
| Style | Dark Mode (OLED)，浅色不建议 | 双主题等价，暗色优先 | 产品两种主题都在用 |
| 反模式 / 检查清单 / 动效 | 通用 | 保留并追加本项目 8 条 | 技能数据有效，需本地化 |
