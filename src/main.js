import { createPinia } from "pinia";
import { createApp } from "vue";

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
  const saved = localStorage.getItem("theme") || "auto";
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
          const t = localStorage.getItem("theme") || "auto";
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

// 挂载应用
app.mount("#app");
