<template>
  <n-button
    circle
    size="medium"
    class="theme-toggle"
    aria-label="切换深色/浅色主题"
    @click="toggleTheme"
  >
    <template #icon>
      <n-icon v-if="isDark">
        <Sunny />
      </n-icon>
      <n-icon v-else>
        <Moon />
      </n-icon>
    </template>
  </n-button>
</template>

<script setup>
import { Moon, Sunny } from "@vicons/ionicons5";
import { useTheme } from "@/composables/useTheme";

const { isDark, toggleTheme } = useTheme();
</script>

<style scoped lang="scss">
.theme-toggle {
  color: var(--color-icon);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);

  &:hover {
    color: var(--color-text-primary);
    background: var(--color-surface-hover);
  }
}
</style>
