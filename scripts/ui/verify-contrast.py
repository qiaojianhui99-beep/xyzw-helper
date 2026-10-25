#!/usr/bin/env python3
"""从 src/assets/styles/tokens.scss 读出两套主题的 token，逐场景计算对比度。

输出 design-system/xyzw-console/CONTRAST-REPORT.md。
只做计算，不猜值：凡是 tokens.scss 里找不到的 token 直接报 missing。
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] if len(sys.argv) > 1 else Path(".")
TOKENS = Path("src/assets/styles/tokens.scss")
OUT = Path("design-system/xyzw-console/CONTRAST-REPORT.md")


def parse_tokens(text):
    """返回 {'light': {...}, 'dark': {...}}，只取 --color-* 与 --shadow* 之外的纯色值。"""
    light, dark = {}, {}
    # 去掉注释
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)

    def grab(block):
        out = {}
        for m in re.finditer(r"(--[a-z0-9-]+)\s*:\s*([^;]+);", block):
            out[m.group(1)] = m.group(2).strip()
        return out

    # light = 第一个 :root 块
    m = re.search(r":root\s*\{(.*?)\n\}", text, re.S)
    light.update(grab(m.group(1)))
    # dark = html[data-theme="dark"], html.dark {...}
    m = re.search(r'html\[data-theme="dark"\],\s*\nhtml\.dark\s*\{(.*?)\n\}', text, re.S)
    dark.update(grab(m.group(1)))
    return light, dark


def to_rgba(value):
    v = value.strip()
    if v.startswith("#"):
        h = v.lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
    m = re.match(r"rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)", v)
    if m:
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (float(m.group(1)), float(m.group(2)), float(m.group(3)), a)
    raise ValueError(f"cannot parse color: {value}")


def composite(fg, bg):
    """fg 叠在 bg 上（bg 不透明）。"""
    fr, fg_, fb, fa = fg
    br, bg_, bb, _ = bg
    return (
        fr * fa + br * (1 - fa),
        fg_ * fa + bg_ * (1 - fa),
        fb * fa + bb * (1 - fa),
        1.0,
    )


def lum(rgba):
    def f(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b, _ = rgba
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(c1, c2):
    l1, l2 = lum(c1), lum(c2)
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


def main():
    light, dark = parse_tokens(TOKENS.read_text(encoding="utf-8"))
    # 兼容别名层不影响本次计算
    missing = []

    def get(theme, name):
        table = light if theme == "light" else dark
        if name not in table:
            missing.append((theme, name))
            return "#000000"
        return table[name]

    # 场景： (说明, 前景 token, 背景 token, 是否叠在 surface 上（用于 rgba 前景）, 阈值, 类别)
    scenarios = [
        ("正文 vs 页面背景", "--color-text-primary", "--color-bg", False, 4.5, "文字"),
        ("正文 vs 卡片表面", "--color-text-primary", "--color-surface", False, 4.5, "文字"),
        ("次要文字 vs 卡片表面", "--color-text-secondary", "--color-surface", False, 4.5, "文字"),
        ("辅助说明 vs 卡片表面", "--color-text-muted", "--color-surface", False, 4.5, "文字"),
        ("辅助说明 vs 表头/斑马纹", "--color-text-muted", "--color-surface-muted", False, 4.5, "文字"),
        ("按钮文字 vs 主按钮底", "--color-accent-text", "--color-accent", False, 4.5, "按钮"),
        ("按钮文字 vs 主按钮 hover", "--color-accent-text", "--color-accent-hover", False, 4.5, "按钮"),
        ("按钮文字 vs 主按钮 active", "--color-accent-text", "--color-accent-active", False, 4.5, "按钮"),
        ("禁用按钮文字 vs 禁用底（WCAG 豁免，仅记录）", "--color-text-disabled", "--color-surface-muted", False, 0, "禁用"),
        ("禁用按钮底 vs 正常按钮底（可分辨）", "--color-surface-muted", "--color-accent", False, 1.3, "禁用"),
        ("图标 vs 卡片表面", "--color-icon", "--color-surface", False, 3.0, "图标"),
        ("图标 vs 图标按钮 hover 底", "--color-text-primary", "--color-surface-hover", False, 3.0, "图标"),
        ("输入框边界 vs 表面(3:1)", "--color-border-strong", "--color-surface", False, 3.0, "控件"),
        ("占位符文字 vs 表面", "--color-text-muted", "--color-surface", False, 4.5, "控件"),
        ("卡片 vs 页面背景（层级）", "--color-surface", "--color-bg", False, 1.05, "层级"),
        ("浮层 vs 页面背景（层级）", "--color-surface-raised", "--color-bg", False, 1.05, "层级"),
        ("浮层描边 vs 浮层底（light 层级靠描边+阴影）", "--color-border", "--color-surface-raised", False, 1.02, "层级"),
        ("浮层 vs 卡片表面（仅参考，light 同事白底）", "--color-surface-raised", "--color-surface", False, 0, "层级"),
        ("表格斑马纹 vs 正常行", "--color-surface-muted", "--color-surface", False, 1.02, "表格"),
        ("表格悬停行 vs 正常行", "--color-surface-hover", "--color-surface", False, 1.02, "表格"),
        ("表格选中行底 vs 正常行", "--color-accent-soft", "--color-surface", False, 1.02, "表格"),
        ("选中行文字 vs 选中底", "--color-text-primary", "--color-accent-soft", False, 4.5, "表格"),
        ("成功标签文字 vs 标签底", "--color-success-text", "--color-success-soft", True, 4.5, "徽章"),
        ("警告标签文字 vs 标签底", "--color-warning-text", "--color-warning-soft", True, 4.5, "徽章"),
        ("失败标签文字 vs 标签底", "--color-danger-text", "--color-danger-soft", True, 4.5, "徽章"),
        ("信息标签文字 vs 标签底", "--color-info-text", "--color-info-soft", True, 4.5, "徽章"),
        ("链接 vs 卡片表面", "--color-link", "--color-surface", False, 4.5, "链接"),
        ("链接 vs 页面背景", "--color-link", "--color-bg", False, 4.5, "链接"),
        ("禁用文字 vs 表面（WCAG 豁免，仅记录）", "--color-text-disabled", "--color-surface", False, 0, "禁用"),
        ("禁用文字 vs 正常文字（可分辨）", "--color-text-disabled", "--color-text-primary", False, 1.3, "禁用"),
        ("装饰性分隔线 vs 表面", "--color-border", "--color-surface", False, 1.02, "层级"),
    ]

    rows = []
    fails = []
    for desc, fg_tok, bg_tok, over_surface, threshold, cat in scenarios:
        res = {}
        for theme in ("light", "dark"):
            fg = to_rgba(get(theme, fg_tok))
            bg = to_rgba(get(theme, bg_tok))
            if over_surface:
                surface = to_rgba(get(theme, "--color-surface"))
                fg = composite(fg, surface if theme == "light" else surface)
                bg = composite(bg, surface)
            val = contrast(fg, bg)
            res[theme] = val
            if threshold and val + 1e-9 < threshold:
                fails.append((theme, desc, round(val, 2), threshold))
        rows.append((cat, desc, res["light"], res["dark"], threshold))

    lines = []
    lines.append("# 双主题可读性 · 实测对比度报告\n")
    lines.append(
        "> 由 `scripts/ui/verify-contrast.py` 从 `src/assets/styles/tokens.scss` 直接读取 token 计算，"
        "不凭肉眼判断。WCAG 2.1 相对亮度公式，rgba 先做 alpha 合成再计算。\n"
    )
    graded = [x for x in scenarios if x[4]]
    lines.append(f"- 场景数：{len(scenarios)} × 2 主题 = {len(scenarios) * 2} 项（其中 {len(graded) * 2} 项有硬阈值）")
    lines.append(f"- 不达标项：{len(fails)}")
    if missing:
        lines.append(f"- tokens.scss 缺失 token：{sorted(set(missing))}")
    lines.append("")
    lines.append("| 类别 | 场景 | light | 阈值 | dark | 结论 |")
    lines.append("|---|---|---|---|---|---|")
    for cat, desc, lv, dv, th in rows:
        if th:
            ok = lv + 1e-9 >= th and dv + 1e-9 >= th
            verdict = "通过" if ok else "不达标"
            th_text = f"≥{th}"
        else:
            verdict = "仅记录（WCAG 对禁用态/同色底不设阈值）"
            th_text = "—"
        lines.append(
            f"| {cat} | {desc} | **{lv:.2f}:1** | {th_text} | **{dv:.2f}:1** | {verdict} |"
        )

    if fails:
        lines.append("\n## 不达标明细\n")
        for theme, desc, val, th in fails:
            lines.append(f"- {theme} / {desc}: {val}:1 (需要 ≥{th})")
    else:
        lines.append("\n## 结论\n")
        lines.append("全部场景在 light 与 dark 下均达到阈值。\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
