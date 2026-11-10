import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

/**
 * vitest 配置（与 node:test 并存）。
 *
 * 为什么单独一份配置、不复用 vite.config.js：
 *   vite.config.js 里有 unocss / auto-import / vue-router 插件链与开发代理，
 *   对单测是纯负担。这里只保留渲染 .vue 需要的 @vitejs/plugin-vue 与 `@` 别名。
 *
 * 两套测试的分工：
 *   - `node --test test/*.test.js`：纯 Node 环境（协议、存储门面、契约、事件插件）
 *   - `vitest`：需要 DOM / Vue 运行时（store、composable、组件）
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,js}"],
    setupFiles: ["./test/vitest-setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,js}"],
      exclude: [
        "src/**/*.test.{ts,js}",
        "src/**/*.d.ts",
        "src/xyzw/**",
        "src/main.js",
        "src/router/index.js",
        "src/locales/**",
      ],
      all: true,
    },
  },
});
