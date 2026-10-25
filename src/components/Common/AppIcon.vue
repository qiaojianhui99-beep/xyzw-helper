<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke-width="strokeWidth"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="app-icon"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script setup>
import { computed } from "vue";

/**
 * 纯表现层 SVG 图标（Lucide 几何，无 emoji、无外部依赖）。
 * 只替换原来直接用 emoji 当图标的位置，不承载任何交互。
 */
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 2 },
});

const ICONS = {
  sparkles: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"],
  "arrow-up": ["M12 19V5", "M5 12l7-7 7 7"],
  bug: [
    "M8 2l1.9 1.9M16 2l-1.9 1.9",
    "M9 7h6a3 3 0 013 3v2a6 6 0 01-12 0v-2a3 3 0 013-3z",
    "M12 7v13M5 10H2M22 10h-3M5 15H2M22 15h-3",
  ],
  warning: [
    "M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
    "M12 9v4M12 17h.01",
  ],
  history: [
    "M3 3v5h5",
    "M3.05 13A9 9 0 1012 3 9 9 0 004.6 6.6L3 8",
    "M12 7v5l4 2",
  ],
  rocket: [
    "M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.9.7-2.2-.1-3-.8-.8-2.1-.8-2.9 0z",
    "M12 15l-3-3a22 22 0 012-3.9A12.9 12.9 0 0122 2c0 2.7-.9 7.9-6 11a22 22 0 01-4 2z",
  ],
  chart: ["M3 3v18h18", "M7 15v3M12 9v9M17 5v13"],
  target: [
    "M12 22a10 10 0 100-20 10 10 0 000 20z",
    "M12 18a6 6 0 100-12 6 6 0 000 12z",
    "M12 14a2 2 0 100-4 2 2 0 000 4z",
  ],
  close: ["M18 6L6 18", "M6 6l12 12"],
  trophy: [
    "M8 21h8M12 17v4",
    "M7 4h10v5a5 5 0 01-10 0V4z",
    "M7 6H4a2 2 0 000 4h3M17 6h3a2 2 0 010 4h-3",
  ],
  calendar: ["M8 2v4M16 2v4M3 10h18", "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"],
  box: ["M21 8l-9-5-9 5 9 5 9-5z", "M3 8v8l9 5 9-5V8", "M12 13v8"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  heart: [
    "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 000-7.8z",
  ],
  user: [
    "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2",
    "M12 11a4 4 0 100-8 4 4 0 000 8z",
  ],
  unlock: ["M7 11V7a5 5 0 019.9-1", "M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  flame: [
    "M12 22c4.4 0 7-2.8 7-6.5 0-4.5-4-6.5-3-11.5-3 1-5 4-5 7-1 0-2-1-2-2.5C7 11 5 13 5 15.5 5 19.2 7.6 22 12 22z",
  ],
  check: ["M20 6L9 17l-5-5"],
  clock: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"],
  sword: ["M14.5 17.5L3 6V3h3l11.5 11.5", "M13 19l6-6M16 16l4 4M19 21l2-2"],
  leaf: ["M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"],
};

const paths = computed(() => ICONS[props.name] || ICONS.sparkles);
</script>

<style scoped>
.app-icon {
  display: inline-block;
  flex: none;
  vertical-align: middle;
}
</style>
