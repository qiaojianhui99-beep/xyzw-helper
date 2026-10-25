# XYZW Token Manager Design System Master

## Product Type
B 端数据管理后台 - SaaS 内部工具，Token 管理 + 游戏自动化控制台。

## 气质关键词
克制、技术感、编辑感、可信

## 禁用元素
- 紫色/靛蓝渐变（当前 #667eea 保持，但强调色调整为 #2563EB）
- 全屏居中英雄区
- 三列圆角图标卡片堆砌
- emoji 图标
- 玻璃拟态滥用

## 配色系统 (Semantic Tokens)

### 基础色
--color-primary: #2563EB  (Trust Blue)
--color-primary-hover: #1E40AF
--color-primary-active: #1E3A8A
--color-primary-disabled: #94A3B8

--color-accent: #EA580C  (Orange CTA)
--color-accent-hover: #C2410C
--color-accent-active: #9A3412
--color-accent-disabled: #FDBA74

--color-secondary: #3B82F6
--color-secondary-hover: #2563EB
--color-secondary-active: #1E40AF
--color-secondary-disabled: #94A3B8

--color-success: #10B981
--color-warning: #F59E0B
--color-error: #EF4444
--color-info: #3B82F6

### 中性色
--color-background: #F8FAFC  (Light)
--color-background-dark: #0F172A  (Dark)
--color-surface: #FFFFFF
--color-surface-dark: #1E293B
--color-surface-raised: #F1F5F9
--color-surface-raised-dark: #334155

--color-text-primary: #1E293B
--color-text-primary-dark: #F1F5F9
--color-text-secondary: #475569
--color-text-secondary-dark: #94A3B8
--color-text-muted: #64748B
--color-text-muted-dark: #64748B
--color-text-disabled: #94A3B8
--color-text-disabled-dark: #64748B

--color-border: #E2E8F0
--color-border-dark: #334155
--color-border-strong: #CBD5E1
--color-border-strong-dark: #475569

--color-accent-text: #FFFFFF
--color-accent-text-dark: #FFFFFF

--color-icon: #64748B
--color-icon-dark: #94A3B8

--color-overlay: rgba(15, 23, 42, 0.7)
--color-overlay-dark: rgba(15, 23, 42, 0.8)

### 圆角规则
--radius-sm: 6px
--radius-md: 8px
--radius-lg: 12px
--radius-xl: 16px
--radius-2xl: 20px

### 间距尺度
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 16px
--spacing-lg: 24px
--spacing-xl: 32px
--spacing-2xl: 48px
--spacing-3xl: 64px

### 阴影
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)

### 字体栈
--font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif
--font-family-heading: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif

## 动效规则
- Hover: 150-250ms cubic-bezier(0.4, 0, 0.2, 1)
- Active: 100ms ease-out
- Transition: all 0.15s ease-out
- Reduced motion: respect prefers-reduced-motion

## 组件规范
- 按钮: 8px 圆角, 48px 高度, 最小宽度 120px
- 卡片: 8px 圆角, 阴影 md
- 输入框: 6px 圆角, 48px 高度
- 表格: 6px 圆角, 斑马纹

