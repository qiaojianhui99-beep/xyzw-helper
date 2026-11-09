import { createPinia } from "pinia";
import { createApp } from "vue";
import { storage } from "@/api/storage";
import { bootCloudStorage } from "@/api/storageSync";

import App from "./App.vue";
import router from "./router";
import "virtual:uno.css";
import "./assets/styles/global.scss";

// 创建应用实例
const app = createApp(App);

// 使用插件
// naive-ui 组件由 unplugin-vue-components 的 NaiveUiResolver 按需引入，
// 不再 app.use(naive) 全量注册（那会打进整套组件库）。
app.use(createPinia());
app.use(router);

// 全局主题应用：从 localStorage 读取并设置 data-theme 属性
const applyTheme = () => {
  const saved = storage.getItem("theme") || "auto";
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (saved === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark)
      document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");

    // 跟随系统变更
    if (window.matchMedia) {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
          const t = storage.getItem("theme") || "auto";
          if (t === "auto") {
            if (e.matches)
              document.documentElement.setAttribute("data-theme", "dark");
            else document.documentElement.removeAttribute("data-theme");
          }
        });
    }
  }
};

applyTheme();

/**
 * 启动云端同步（可选）。
 *
 * 行为保证：未在设置里配置 apiKey 时，bootCloudStorage() 直接返回 false，
 * storage 保持纯本地模式 —— 页面行为与改造前完全一致。
 * 配置了 apiKey 才会向后端拉取并开启写穿同步。
 *
 * 失败不阻塞启动：后端不可达时静默退回本地模式。
 */
bootCloudStorage().catch(() => {});

// 挂载应用
app.mount("#app");
