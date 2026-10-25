<template>
  <n-config-provider :theme="naiveTheme">
    <n-message-provider>
      <n-loading-bar-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <div id="app">
              <router-view />
            </div>
          </n-dialog-provider>
        </n-notification-provider>
      </n-loading-bar-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { darkTheme } from "naive-ui";
import { computed, onMounted, onUnmounted } from "vue";
import { useTheme } from "@/composables/useTheme";

const { isDark, initTheme, setupSystemThemeListener, updateReactiveState } =
  useTheme();

// Naive UI 主题
const naiveTheme = computed(() => {
  return isDark.value ? darkTheme : null;
});

// 监听主题变化事件
const handleThemeChange = () => {
  // 确保响应式状态同步
  updateReactiveState();
  // 强制重新渲染
  setTimeout(() => {
    updateReactiveState();
  }, 50);
};

onMounted(() => {
  initTheme();
  setupSystemThemeListener();

  // 监听自定义主题变化事件
  window.addEventListener("theme-change", handleThemeChange);

  // 初始化时更新状态
  updateReactiveState();
});

onUnmounted(() => {
  window.removeEventListener("theme-change", handleThemeChange);
});
</script>

<style>
/* =============================================================
   App 级样式：只保留「主题接线」与「应用外壳」，基础 reset 在
   src/assets/styles/global.scss。这里不再出现裸 hex、紫靛渐变，
   也不再出现 `html.dark * { color: var(--color-accent-text) !important }` 那种把
   主/次/弱化文字一把抹平的通配覆盖（它会让层级彻底消失）。
   ============================================================= */

:root {
  --app-background: var(--color-bg);
  --text-color: var(--color-text-primary);
  --text-secondary: var(--color-text-secondary);
  --text-tertiary: var(--color-text-muted);
  --bg-color: var(--color-surface);
  --border-color: var(--color-border);
}

html.dark,
html[data-theme="dark"] {
  color-scheme: dark;
}

html,
body {
  height: 100%;
  font-family: var(--font-family);
  color: var(--color-text-primary);
  background: var(--color-bg);
  transition: background-color var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
}

#app {
  min-height: 100vh;
  color: var(--color-text-primary);
  background: var(--color-bg);
  transition: background-color var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
}

/* Naive UI 浮层保持与语义层级一致（深色下用更亮的 surface + 描边，
   不靠阴影，避免弹窗与页面背景糊成一片） */
html[data-theme="dark"] .n-modal,
html[data-theme="dark"] .n-dialog,
html[data-theme="dark"] .n-popover,
html.dark .n-modal,
html.dark .n-dialog,
html.dark .n-popover {
  border: 1px solid var(--color-border);
}

/* 占位符用 token，深浅两套都可读 */
::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}
</style>
