import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 自建后端地址（backend/，Fastify）。只在 dev 下用于反向代理业务 API。
 * 改端口时可用 VITE_BACKEND_URL 覆盖，无需改文件。
 */
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://127.0.0.1:3002";

async function safeImport(moduleName, humanName) {
  try {
    return await import(moduleName);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      console.warn(
        `[vite] Optional dependency "${moduleName}" (${humanName}) not found; continuing without it.`,
      );
      return null;
    }
    throw error;
  }
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

/**
 * 把 src/xyzw/** 原样拷进 dist/game-runtime/。
 * 这些文件是游戏侧产物（不允许改），本身就是独立的经典脚本，
 * 不需要（也不应该）进 rollup 依赖图，交给 src/utils/gameRuntime.js 运行时注入。
 */
function emitGameRuntimePlugin() {
  const files = ["cocos2d-js-min.js", "game-defines.js", "index.js"];
  return {
    name: "emit-game-runtime",
    apply: "build",
    enforce: "post",
    closeBundle() {
      const fromDir = path.resolve(__dirname, "src/xyzw");
      const toDir = path.resolve(__dirname, "dist/game-runtime");
      if (!fs.existsSync(fromDir)) {
        console.warn(`\n[emit-game-runtime] 未找到 ${fromDir}`);
        return;
      }
      fs.mkdirSync(toDir, { recursive: true });
      let bytes = 0;
      for (const file of files) {
        const src = path.join(fromDir, file);
        if (!fs.existsSync(src)) {
          console.warn(`\n[emit-game-runtime] 缺少 ${file}，跳过`);
          continue;
        }
        fs.copyFileSync(src, path.join(toDir, file));
        bytes += fs.statSync(src).size;
      }
      console.log(
        `\n[emit-game-runtime] ${files.length} 个文件 → dist/game-runtime/（${(bytes / 1024 / 1024).toFixed(2)} MB，按需加载）`,
      );
    },
  };
}

/**
 * 开发态直接吐 src/xyzw 的原始文件：走 Vite 的 transform 管线会塞进 inline sourcemap，
 * 1.7 MB 的文件会膨胀成 12 MB。
 */
function gameRuntimeDevPlugin() {
  const files = new Set(["cocos2d-js-min.js", "game-defines.js", "index.js"]);
  return {
    name: "game-runtime-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        const idx = url.indexOf("/game-runtime/");
        if (idx === -1) return next();
        const name = url.slice(idx + "/game-runtime/".length);
        if (!files.has(name)) return next();
        const file = path.resolve(__dirname, "src/xyzw", name);
        if (!fs.existsSync(file)) {
          res.statusCode = 404;
          res.end("game runtime file not found");
          return;
        }
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(file).pipe(res);
        return undefined;
      });
    },
  };
}

/**
 * 产物预压缩：为静态服务器（nginx gzip_static / Cloudflare Pages）生成 .gz 与 .br，
 * 省掉运行时压缩的 CPU，也让 CDN 能直接吐压缩体。
 */
function precompressPlugin() {
  const targets = /\.(?:js|mjs|css|html|json|svg|txt|xml|map)$/i;
  const minBytes = 1024;
  const maxBrotliBytes = 6 * 1024 * 1024;
  return {
    name: "precompress",
    apply: "build",
    enforce: "post",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      if (!fs.existsSync(distDir)) return;
      let count = 0;
      let raw = 0;
      let gz = 0;
      let br = 0;
      for (const file of walkFiles(distDir)) {
        if (!targets.test(file)) continue;
        const buf = fs.readFileSync(file);
        if (buf.length < minBytes) continue;
        const gzBuf = zlib.gzipSync(buf, { level: 9 });
        fs.writeFileSync(`${file}.gz`, gzBuf);
        let brSize = 0;
        if (buf.length <= maxBrotliBytes) {
          const brBuf = zlib.brotliCompressSync(buf, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
              [zlib.constants.BROTLI_PARAM_MODE]:
                zlib.constants.BROTLI_MODE_TEXT,
            },
          });
          fs.writeFileSync(`${file}.br`, brBuf);
          brSize = brBuf.length;
        }
        count += 1;
        raw += buf.length;
        gz += gzBuf.length;
        br += brSize;
      }
      console.log(
        `\n[precompress] ${count} 个文件：原始 ${(raw / 1024 / 1024).toFixed(2)} MB → gzip ${(gz / 1024 / 1024).toFixed(2)} MB / brotli ${(br / 1024 / 1024).toFixed(2)} MB`,
      );
    },
  };
}

/** 第三方依赖分包：把长期不变的库拆成独立 vendor chunk，便于长缓存与并行下载 */
function manualChunks(id) {
  if (!id.includes("node_modules")) return undefined;
  const normalized = id.replace(/\\/g, "/");
  if (normalized.includes("/xlsx/")) return "vendor-xlsx";
  if (normalized.includes("/html2canvas/")) return "vendor-html2canvas";
  if (normalized.includes("/moment/")) return "vendor-moment";
  if (normalized.includes("/crypto-js/") || normalized.includes("/lz4js/")) {
    return "vendor-crypto";
  }
  if (
    normalized.includes("/naive-ui/") ||
    normalized.includes("/vueuc/") ||
    normalized.includes("/seemly/") ||
    normalized.includes("/css-render/") ||
    normalized.includes("/@css-render/") ||
    normalized.includes("/treemate/") ||
    normalized.includes("/vdirs/") ||
    normalized.includes("/vooks/") ||
    normalized.includes("/evtd/") ||
    normalized.includes("/@vicons/")
  ) {
    return "vendor-naive";
  }
  if (
    normalized.includes("/node_modules/vue/") ||
    normalized.includes("/node_modules/@vue/") ||
    normalized.includes("/vue-router/") ||
    normalized.includes("/pinia/") ||
    normalized.includes("/@vueuse/") ||
    normalized.includes("/vue-i18n/") ||
    normalized.includes("/@intlify/")
  ) {
    return "vendor-vue";
  }
  if (
    normalized.includes("/axios/") ||
    normalized.includes("/p-queue/") ||
    normalized.includes("/idb/") ||
    normalized.includes("/event-emitter3/")
  ) {
    return "vendor-misc";
  }
  return undefined;
}

export default defineConfig(async () => {
  let basicSsl;
  try {
    ({ default: basicSsl } = await import("@vitejs/plugin-basic-ssl"));
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }
    console.warn(
      "[vite] '@vitejs/plugin-basic-ssl' not found, starting without HTTPS support.",
    );
  }

  const routerModule = await safeImport(
    "unplugin-vue-router/vite",
    "file-based routing",
  );
  const autoImportModule = await safeImport(
    "unplugin-auto-import/vite",
    "auto-imports",
  );
  const componentsModule = await safeImport(
    "unplugin-vue-components/vite",
    "component auto-registration",
  );
  const componentsResolversModule = componentsModule
    ? await safeImport(
        "unplugin-vue-components/resolvers",
        "component resolvers",
      )
    : null;
  const unoCssModule = await safeImport("unocss/vite", "UnoCSS");
  const vueDevToolsModule = await safeImport(
    "vite-plugin-vue-devtools",
    "Vue DevTools",
  );
  const vueI18nModule = await safeImport(
    "@intlify/unplugin-vue-i18n/vite",
    "Vue I18n pre-compiler",
  );

  const routerPlugin = routerModule?.default?.({
    routesFolder: "src/views",
    logs: true,
    exclude: ["**/components/**", "**/test**.vue", "**/**Modal.vue"],
    importMode: "async",
    dts: "src/typed-router.d.ts",
  });

  const autoImportPlugin = autoImportModule?.default?.({
    imports: ["vue", "vue-router", "vue-i18n"],
    dts: "src/auto-imports.d.ts",
  });

  const { ArcoResolver, NaiveUiResolver } = componentsResolversModule ?? {};
  const resolvers = [
    // 按需引入 naive-ui 组件（模板里的 <n-button> 等），替代 app.use(naive) 全量注册
    NaiveUiResolver && NaiveUiResolver({ importStyle: false }),
    // importStyle: "css" → 只把真正用到的组件样式注入对应 chunk，
    // 不再在 main.js 全量 import arco.css（468 KB）
    ArcoResolver && ArcoResolver({ importStyle: "css" }),
  ].filter(Boolean);
  const componentsPlugin = componentsModule?.default?.({
    dirs: ["src/components"],
    globsExclude: ["**/Private/**"],
    resolvers,
  });

  const unoCssPlugin = unoCssModule?.default?.();
  const vueDevToolsPlugin = vueDevToolsModule?.default?.();
  const vueI18nPlugin = vueI18nModule?.default?.({
    module: "vue-i18n",
    include: path.resolve(__dirname, "./src/locales/**"),
  });

  const plugins = [
    routerPlugin && { ...routerPlugin, enforce: "pre" },
    vue(),
    vueDevToolsPlugin,
    basicSsl && basicSsl(),
    unoCssPlugin,
    autoImportPlugin,
    componentsPlugin,
    vueI18nPlugin,
    {
      name: "copy-worker",
      closeBundle() {
        try {
          const src = path.resolve(__dirname, "worker.js");
          // Cloudflare Pages Advanced Mode expects _worker.js
          const dest = path.resolve(__dirname, "dist/_worker.js");
          if (fs.existsSync(src)) {
            if (!fs.existsSync(path.dirname(dest))) {
              fs.mkdirSync(path.dirname(dest), { recursive: true });
            }
            fs.copyFileSync(src, dest);
            console.log("\n[copy-worker] worker.js copied to dist/_worker.js");
          } else {
            console.warn(`\n[copy-worker] worker.js not found at ${src}`);
          }
        } catch (e) {
          console.error("\n[copy-worker] Error copying worker.js:", e);
        }
      },
    },
    gameRuntimeDevPlugin(),
    emitGameRuntimePlugin(),
    precompressPlugin(),
  ].filter(Boolean);

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
      dedupe: ["vue", "vue-router"],
    },
    build: {
      // 保持 Vite 默认的现代浏览器基线（WeChat / iOS 老 WebView 仍在用）
      target: "modules",
      outDir: "dist",
      assetsDir: "assets",
      sourcemap: false,
      minify: "esbuild",
      cssMinify: "esbuild",
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 900,
      modulePreload: { polyfill: true },
      rollupOptions: {
        output: {
          manualChunks,
          // 让 vendor chunk 的文件名稳定，便于 CDN 长缓存
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    // 非致命但会拖累产物的调试代码：构建时去掉 debugger 断点
    esbuild: {
      drop: ["debugger"],
    },
    optimizeDeps: {
      include: [
        "vue",
        "vue-router",
        "pinia",
        "naive-ui",
        "@arco-design/web-vue",
        "@vueuse/core",
        "xlsx",
      ],
    },
    server: {
      port: 3000,
      open: true,
      host: true,
      proxy: {
        // 手机号验证码接口需要以 ucenter-app-server Host 路由。
        "/api/hortor-ucenter": {
          target: "https://comb-platform.hortorgames.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/hortor-ucenter/, ""),
          secure: true,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 12; ALN-AL80 Build/HUAWEIALN-AL80; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.196 Mobile Safari/537.36",
            Accept: "application/json",
            Host: "ucenter-app-server.hortorgames.com",
            "Content-Type": "application/json; charset=utf-8",
          },
        },
        // 微信登录接口代理
        "/api/weixin": {
          target: "https://open.weixin.qq.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/weixin/, ""),
          secure: true,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            Referer: "https://open.weixin.qq.com/",
          },
        },
        // 微信扫码状态轮询代理
        "/api/weixin-long": {
          target: "https://long.open.weixin.qq.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/weixin-long/, ""),
          secure: true,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN",
            Accept: "*/*",
            Referer: "https://open.weixin.qq.com/",
          },
        },
        // Hortor登录接口代理
        "/api/hortor": {
          target: "https://comb-platform.hortorgames.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/hortor/, ""),
          secure: true,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 12; 23117RK66C Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36",
            Accept: "*/*",
            Host: "comb-platform.hortorgames.com",
            Connection: "keep-alive",
            "Content-Type": "text/plain; charset=utf-8",
            Origin: "https://open.weixin.qq.com",
            Referer: "https://open.weixin.qq.com/",
          },
        },
        // ------------------------------------------------------------------
        // 自建后端（backend/，Fastify）—— 只在 pnpm dev 下生效。
        // 生产由 nginx 的 location /api/ 承接（见 deploy/nginx.conf）。
        //
        // 必须逐条列出而不是笼统写 "/api"：上面四条登录代理是更长的前缀，
        // 但 http-proxy 按注册顺序匹配，笼统的 "/api" 会抢在前面把它们吞掉。
        // ------------------------------------------------------------------
        "/api/storage": { target: BACKEND_URL, changeOrigin: true },
        "/api/tokens": { target: BACKEND_URL, changeOrigin: true },
        "/api/tasks": { target: BACKEND_URL, changeOrigin: true },
        "/api/logs": { target: BACKEND_URL, changeOrigin: true },
        "/api/task-definitions": { target: BACKEND_URL, changeOrigin: true },
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern",
          additionalData: '@use "@/assets/styles/variables.scss" as vars;',
        },
      },
    },
  };
});
