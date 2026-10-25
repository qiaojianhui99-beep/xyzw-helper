# 页面级覆盖（Page Overrides）

做具体页面前，先看这里有没有同名文件：

```
pages/dashboard.md   → 覆盖 /admin/dashboard 的规则
pages/tokens.md      → 覆盖 /tokens 的规则
```

存在则**覆盖** `../MASTER.md`；不存在就只用 Master。

生成方式（技能自带）：

```bash
python3 "$HOME/.dsh/skills/ui-ux-pro-max/scripts/search.py" "<页面关键词>" \
  --design-system --persist --page "dashboard" -p "XYZW Console" --output-dir "$(pwd)"
```

注意：Master 已存在时会跳过写入，除非 `--force`；本仓库**不要**随手 `--force`，
Master 是按真实 token 校准过的。

页面覆盖文件只写**与该页有关**的差异（布局、信息密度、特有组件），不要复制 Master 的全局规则。
