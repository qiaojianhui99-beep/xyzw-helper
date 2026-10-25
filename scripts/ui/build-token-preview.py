#!/usr/bin/env python3
"""生成 design-system/xyzw-console/token-preview.html：
把 tokens.scss 原样内联进一个静态预览页，用于人工验收两套主题。
（tokens.scss 是合法 CSS，只含自定义属性，没有 Sass 语法。）

用法：python3 scripts/ui/build-token-preview.py
打开：design-system/xyzw-console/token-preview.html，点右上角按钮切主题，
或改 <html data-theme="dark">。
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOKENS = ROOT / "src/assets/styles/tokens.scss"
OUT = ROOT / "design-system/xyzw-console/token-preview.html"

tokens_css = TOKENS.read_text(encoding="utf-8")

SAMPLES = """
  <div class="preview">
    <header class="preview-head">
      <div>
        <h1>XYZW Console · Token 预览</h1>
        <p class="muted">tokens.scss 内联生成，改 token 后重跑
          <code>python3 scripts/ui/build-token-preview.py</code> 即可同步。</p>
      </div>
      <button id="theme-toggle" class="btn btn-primary" type="button">切换主题</button>
    </header>

    <section class="block">
      <h2>表面层级</h2>
      <div class="swatch-row">
        <div class="swatch" style="background:var(--color-bg);border:1px solid var(--color-border)">
          <span>--color-bg</span>
        </div>
        <div class="swatch" style="background:var(--color-surface);border:1px solid var(--color-border)">
          <span>--color-surface</span>
        </div>
        <div class="swatch" style="background:var(--color-surface-raised);border:1px solid var(--color-border)">
          <span>--color-surface-raised</span>
        </div>
        <div class="swatch" style="background:var(--color-surface-muted);border:1px solid var(--color-border)">
          <span>--color-surface-muted</span>
        </div>
        <div class="swatch" style="background:var(--color-surface-hover);border:1px solid var(--color-border)">
          <span>--color-surface-hover</span>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>文字与强调色</h2>
      <div class="card">
        <p class="t1">正文 text-primary：Token 管理 / 批量任务 / 报文调试</p>
        <p class="t2">次要 text-secondary：连接状态、分组说明</p>
        <p class="t3">弱化 text-muted：最后同步 19:08，3 个账号在线</p>
        <p class="t4">禁用 text-disabled：已断开（不可操作）</p>
        <p><a href="#">链接链接 --color-link</a></p>
        <div class="btn-row">
          <button class="btn btn-primary" type="button">主按钮</button>
          <button class="btn" type="button">次按钮</button>
          <button class="btn btn-danger" type="button">危险描边</button>
          <button class="btn btn-primary" type="button" disabled>禁用</button>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>状态徽章</h2>
      <div class="badge-row">
        <span class="tag tag-success">运行中</span>
        <span class="tag tag-warning">即将过期</span>
        <span class="tag tag-error">连接失败</span>
        <span class="tag tag-info">排队中</span>
        <span class="tag">默认</span>
      </div>
    </section>

    <section class="block">
      <h2>表单控件</h2>
      <div class="field-row">
        <input class="input" placeholder="输入 Token（占位符用 text-muted）" />
        <input class="input" value="禁用输入框" disabled />
      </div>
    </section>

    <section class="block">
      <h2>表格（斑马纹 / 悬停 / 选中）</h2>
      <table class="table table-striped">
        <thead>
          <tr><th>角色</th><th class="num">等级</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr><td>行一</td><td class="num">88</td><td><span class="tag tag-success">在线</span></td></tr>
          <tr><td>行二（斑马纹）</td><td class="num">72</td><td><span class="tag tag-warning">空闲</span></td></tr>
          <tr class="is-selected"><td>行三（选中）</td><td class="num">64</td><td><span class="tag tag-info">运行中</span></td></tr>
        </tbody>
      </table>
    </section>

    <section class="block">
      <h2>三态</h2>
      <div class="state-row">
        <div class="state-empty">
          <div class="state-title">还没有 Token</div>
          <div class="state-desc">导入一个 Token 后即可建立连接并执行批量任务。</div>
        </div>
        <div class="state-error">
          <div class="state-title">加载失败</div>
          <div class="state-desc">请求超时，请重试。</div>
        </div>
        <div class="skel-col">
          <div class="skeleton" style="height:14px;width:80%"></div>
          <div class="skeleton" style="height:14px;width:60%"></div>
          <div class="skeleton" style="height:14px;width:70%"></div>
        </div>
      </div>
    </section>
  </div>
"""

HTML = """<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>XYZW Console · Token 预览</title>
    <style>
/* ===== tokens.scss（原样内联） ===== */
__TOKENS__

/* ===== 预览页外壳 ===== */
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  padding: 32px 16px 64px;
  font-family: var(--font-family);
  color: var(--color-text-primary);
  background: var(--color-bg);
}}
.preview {{ max-width: 1000px; margin: 0 auto; }}
.preview-head {{
  display: flex; gap: 16px; align-items: flex-start; justify-content: space-between;
  padding-bottom: 16px; border-bottom: 1px solid var(--color-border); margin-bottom: 24px;
}}
h1 {{ font-size: 24px; margin: 0 0 6px; }}
h2 {{ font-size: 16px; margin: 0 0 12px; }}
.muted {{ color: var(--color-text-muted); font-size: 13px; margin: 0; }}
code {{ font-family: var(--font-family-mono); font-size: 12px; }}
.block {{ margin-bottom: 28px; }}
.swatch-row {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }}
.swatch {{
  height: 88px; border-radius: var(--radius-md); display: flex; align-items: flex-end;
  padding: 8px; font-size: 12px; color: var(--color-text-secondary);
}}
.card {{
  padding: 20px; background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
}}
.t1 {{ color: var(--color-text-primary); margin: 0 0 8px; }}
.t2 {{ color: var(--color-text-secondary); margin: 0 0 8px; }}
.t3 {{ color: var(--color-text-muted); margin: 0 0 8px; }}
.t4 {{ color: var(--color-text-disabled); margin: 0 0 8px; }}
a {{ color: var(--color-link); }}
.btn-row, .badge-row, .field-row {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }}
.field-row .input {{ max-width: 320px; }}
.state-row {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
.skel-col {{ display: flex; flex-direction: column; gap: 10px; justify-content: center; }}
.btn {{
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 40px; padding: 0 16px; font: inherit; font-size: 14px; font-weight: 500;
  color: var(--color-text-primary); cursor: pointer;
  background: var(--color-surface); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md); transition: background-color 150ms ease-out, border-color 150ms ease-out;
}}
.btn:hover {{ background: var(--color-surface-hover); }}
.btn-primary {{ color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }}
.btn-primary:hover {{ background: var(--color-accent-hover); border-color: var(--color-accent-hover); }}
.btn-danger {{ color: var(--color-danger-text); background: transparent; border-color: var(--color-danger); }}
.btn:disabled {{ color: var(--color-text-disabled); background: var(--color-surface-muted); border-color: var(--color-border); cursor: not-allowed; }}
.btn:focus-visible, a:focus-visible {{ outline: 2px solid var(--color-accent); outline-offset: 2px; }}
.tag {{
  display: inline-flex; align-items: center; padding: 2px 8px; font-size: 12px; font-weight: 500;
  color: var(--color-text-secondary); background: var(--color-surface-muted);
  border: 1px solid var(--color-border); border-radius: var(--radius-xs);
}}
.tag-success {{ color: var(--color-success-text); background: var(--color-success-soft); border-color: transparent; }}
.tag-warning {{ color: var(--color-warning-text); background: var(--color-warning-soft); border-color: transparent; }}
.tag-error {{ color: var(--color-danger-text); background: var(--color-danger-soft); border-color: transparent; }}
.tag-info {{ color: var(--color-info-text); background: var(--color-info-soft); border-color: transparent; }}
.input {{
  width: 100%; min-height: 40px; padding: 0 16px; font: inherit; font-size: 14px;
  color: var(--color-text-primary); background: var(--color-surface);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md);
}}
.input::placeholder {{ color: var(--color-text-muted); }}
.input:disabled {{ color: var(--color-text-disabled); background: var(--color-surface-muted); border-color: var(--color-border); }}
.table {{ width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }}
.table th {{ padding: 8px 16px; text-align: left; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); background: var(--color-surface-muted); border-bottom: 1px solid var(--color-border); }}
.table td {{ padding: 8px 16px; border-bottom: 1px solid var(--color-border-subtle); }}
.table-striped tbody tr:nth-child(2n) {{ background: var(--color-surface-muted); }}
.table tbody tr:hover {{ background: var(--color-surface-hover); }}
.table tr.is-selected {{ background: var(--color-accent-soft); }}
.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
.state-empty, .state-error {{
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: 32px 16px; text-align: center; color: var(--color-text-secondary);
  border: 1px dashed var(--color-border); border-radius: var(--radius-lg);
}}
.state-title {{ font-size: 16px; font-weight: 600; color: var(--color-text-primary); }}
.state-desc {{ font-size: 13px; color: var(--color-text-muted); }}
.state-error {{ border-color: var(--color-danger); }}
.state-error .state-title {{ color: var(--color-danger-text); }}
.skeleton {{
  background: linear-gradient(90deg, var(--color-surface-muted) 25%, var(--color-surface-hover) 37%, var(--color-surface-muted) 63%);
  background-size: 400% 100%; border-radius: var(--radius-sm); animation: shimmer 1.4s ease-in-out infinite;
}}
@keyframes shimmer {{ 0% {{ background-position: 100% 50%; }} 100% {{ background-position: 0 50%; }} }}
@media (prefers-reduced-motion: reduce) {{ .skeleton {{ animation: none; }} }}
    </style>
  </head>
  <body>
__SAMPLES__
    <script>
      const btn = document.getElementById('theme-toggle');
      btn.addEventListener('click', () => {{
        const root = document.documentElement;
        const dark = root.getAttribute('data-theme') === 'dark';
        if (dark) {{
          root.removeAttribute('data-theme');
          root.classList.remove('dark');
        }} else {{
          root.setAttribute('data-theme', 'dark');
          root.classList.add('dark');
        }}
      }});
    </script>
  </body>
</html>
"""

html = (
    HTML.replace("__TOKENS__", tokens_css)
    .replace("__SAMPLES__", SAMPLES)
    .replace("{{", "{")
    .replace("}}", "}")
)
OUT.write_text(html, encoding="utf-8")
print(f"written: {OUT} ({len(html)} bytes)")
