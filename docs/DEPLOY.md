# 部署指南（XYZW Web Helper）

本项目是**纯前端**（Vue 3 + Vite）应用：Token、角色数据全部存在浏览器
localStorage / IndexedDB 里，没有业务后端，也没有数据库。所以「部署到服务器」
= 把 `dist/` 静态文件托管起来 + 配好几条反向代理。

真正需要留意的只有三件事：

1. **`vite.config.js` 里的 `server.proxy` 只在 `npm run dev` 生效**。线上必须由
   nginx / Cloudflare 承接 `/api/hortor*`、`/api/weixin*`，否则手机号登录、
   微信扫码登录全部 404。
2. **SPA 回退**：`vue-router` 用的是 history 模式，所有未知路径要回退到
   `index.html`，否则刷新 `/admin/xxx` 直接 404。
3. **`/api/proxy?url=`** 是「URL 导入 / 一键刷新 Token」用的通用代理，
   `worker.js` 里没有实现，自建服务器要在 nginx 里补（本仓库 `deploy/nginx.conf`
   已经补好）。

---

## 方案总览

| 方案 | 适合场景 | 成本 | 需要做什么 |
|---|---|---|---|
| A. Docker Compose | 有台 VPS，想一条命令跑起来 | 最低 | `docker compose -f deploy/docker-compose.yml up -d --build`（web + /api/proxy sidecar，两条容器） |
| B. 裸机 nginx + rsync | 服务器已装 nginx / 宝塔，只想放静态文件 | 低 | `bash deploy/deploy.sh user@host` |
| C. Cloudflare Pages | 不想运维，免费 CDN，自带 HTTPS | 零 | 连 Git 仓库，构建 `npm run build`，输出 `dist` |
| D. 腾讯 EdgeOne Pages | 国内访问速度要求高 | 零 | 用 `edge-functions/` 目录，构建同上 |

配套目录：

```
deploy/
├── Dockerfile              多阶段构建（node 构建 → nginx 托管）
├── nginx.conf              生产站点配置：SPA + 4 条登录反代 + /api/proxy + gzip
├── docker-compose.yml      compose 编排（web + proxy，默认 8080:80）
├── deploy.sh               裸机一键部署（本地构建 → 上传 → nginx 热加载）
├── remote-install.sh       由 deploy.sh 上传到服务器执行
├── proxy-service/server.mjs  /api/proxy 解码代理（Node ≥ 18，零依赖）
└── cf-pages/functions/api/proxy.js   Cloudflare Pages 用的 /api/proxy 函数
```

---

## 方案 A：Docker Compose（推荐自建 VPS）

```bash
# 在项目根目录
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
```

访问 `http://<服务器IP>:8080`。

镜像内部结构：构建阶段用 Node 24 + pnpm 10.19 跑 `pnpm build`，运行阶段用
`nginx:1.27-alpine`，静态文件落在 `/app/web`，站点配置是 `deploy/nginx.conf`。

compose 里还有第二个容器 `proxy`：`node:24-alpine` 跑
`deploy/proxy-service/server.mjs`，用 `network_mode: "service:web"` 与 nginx 共享
网络命名空间，监听 `127.0.0.1:3001`。nginx 把 `/api/proxy` 反代过去，由它负责
URL 解码与拉取（原因见「`/api/proxy` 为什么需要一个小进程」）。不需要这个功能就
把 compose 里的 `proxy` 段删掉，其他功能不受影响。

前置条件：本机/服务器装了 Docker（≥ 20.10，支持 compose v2）。

改端口：编辑 `deploy/docker-compose.yml` 的 `"8080:80"`。
挂 HTTPS：容器只监听 80，宿主机再放一层 nginx / Caddy / 宝塔反代到
`127.0.0.1:8080`，或者用 Cloudflare 代理（橙云）。

不用 compose 也行：

```bash
docker build -f deploy/Dockerfile -t xyzw-web-helper:latest .
docker run -d --name xyzw -p 8080:80 --restart unless-stopped xyzw-web-helper:latest
```

---

## 方案 B：裸机 nginx + rsync

```bash
# 本机执行，会在本地构建 → 打 tar → scp → 远端 nginx -t && reload
bash deploy/deploy.sh root@1.2.3.4
# 或者自定义 Web 根目录与站点名
bash deploy/deploy.sh deploy@example.com /var/www/xyzw xyzw
```

脚本做的事：

1. `npm run build`
2. 打包 `dist/` → scp 到 `/tmp/xyzw-dist.tgz`
3. 上传 `deploy/nginx.conf`、`deploy/remote-install.sh`
4. 远端 `sudo bash remote-install.sh`：解压到 `WEB_ROOT` → 把配置里的
   `/app/web` 替换成真实路径 → 写入 `/etc/nginx/conf.d/xyzw.conf` →
   `nginx -t` → 热加载

前置条件：服务器已装 nginx；部署账号可 `sudo`；80 端口放行。

如果不用脚本，手工就三行：

```bash
npm run build
rsync -avz --delete dist/ root@SERVER:/var/www/xyzw/
scp deploy/nginx.conf root@SERVER:/etc/nginx/conf.d/xyzw.conf   # 记得把 /app/web 改成 /var/www/xyzw
ssh root@SERVER 'nginx -t && systemctl reload nginx'
```

### 宝塔面板

站点根目录指向 `dist/` 内容，然后「网站 → 设置 → 配置文件」里把
`deploy/nginx.conf` 中 `location` 段（除 `root`/`index` 外）整段贴进站点 `server{}`，
再把 `root` 改成自己的站点目录。伪静态选「vue/ history 模式」也可以，但
`/api/*` 的四条代理必须手工加，否则登录功能不可用。

---

## 方案 C：Cloudflare Pages

仓库里已经有 `wrangler.toml` 和 `worker.js`，构建时会自动产出 `dist/_worker.js`，
Cloudflare 会以 **Advanced Mode** 运行它：四条 `/api/*` 代理 + 静态资源托管一体。

1. Dashboard → Pages → Connect to Git，选本仓库
2. 构建命令 `npm run build`，输出目录 `dist`
3. 保存部署

命令行方式：

```bash
npm run build
npx wrangler pages deploy dist --project-name xyzw-web-helper
```

本地模拟（`npm run preview` 不会执行 worker 里的代理逻辑，必须用 wrangler）：

```bash
npx wrangler pages dev dist
# http://localhost:8787
```

**已知缺口**：Advanced Mode 下 `worker.js` 没有 `/api/proxy`，所以「URL 导入 /
一键刷新 Token」会 404。要补齐有两种做法：

- 把 `deploy/cf-pages/functions/api/proxy.js` 拷到项目根 `functions/api/proxy.js`，
  并关闭 Advanced Mode（不再产出 `dist/_worker.js`），四条登录代理改用
  `edge-functions/` 里的写法迁到 `functions/api/*`；
- 或者直接把 `proxyFetch` 逻辑合并进 `worker.js` 的路由表（prefix 换成
  `/api/proxy` 走 query 参数）。

Advanced Mode 与 `functions/` 目录互斥，不要同时启用。

---

## 方案 D：腾讯 EdgeOne Pages

`edge-functions/` 目录里的四个文件已经是 EdgeOne 的写法
（`edge-functions/api/<前缀>/[[default]].js`），函数里负责把 `/api/xxx/*`
转发到上游，注释说明了与原 nginx 配置的对应关系。

构建命令 `npm run build`，输出目录 `dist`，其余与 Cloudflare Pages 类似。
同样缺 `/api/proxy`，需要按 `deploy/cf-pages/functions/api/proxy.js` 的逻辑补一个
`edge-functions/api/proxy/[[default]].js`。

---

## 配置要点（部署完必看）

### 1. 四条反代与原配置严格对应

| 前端请求 | 上游 | 特殊要求 |
|---|---|---|
| `/api/hortor-ucenter/*` | `https://comb-platform.hortorgames.com/*` | **Host 头写成 `ucenter-app-server.hortorgames.com`**，但 TLS SNI 仍是 `comb-platform`；nginx 里必须显式 `proxy_ssl_name comb-platform.hortorgames.com;`，否则握手失败 |
| `/api/hortor/*` | `https://comb-platform.hortorgames.com/*` | 带 `Origin`/`Referer: https://open.weixin.qq.com`，`Content-Type: text/plain` |
| `/api/weixin/*` | `https://open.weixin.qq.com/*` | 302 的 `Location` 要改回同源（`proxy_redirect`），否则浏览器跟着跳到外域 |
| `/api/weixin-long/*` | `https://long.open.weixin.qq.com/*` | 长轮询：`proxy_buffering off` + 读超时 ≥ 120s |
| `/api/proxy?url=` | 参数指定的任意地址 | nginx 不解码 query，必须交给 `deploy/proxy-service/server.mjs` 解码后再拉取（见下节） |

### 2. WebSocket 不需要代理

前端连的是 `wss://xxz-xyzw.hortorgames.com/agent?p=<token>...`，浏览器直连游戏服，
不经过你的服务器。所以不用配 `proxy_set_header Upgrade`。反过来说：**站点必须是
HTTPS**，否则浏览器在 https 页面里连 wss 之外的 ws 会被拦（本项目用的是 wss，
http 页面也能连，但登录接口跨域策略更宽松，建议直接上 HTTPS）。

### 3. 缓存与压缩

- `dist/assets/*` 带内容 hash，`Cache-Control: public, immutable` + 1 年
- `index.html` 必须 `no-cache`，否则发版后用户拿到旧壳
- 主 chunk ≈ 4.7 MB，`deploy/nginx.conf` 已开 gzip；用 CDN 的话在 CDN 侧开 Brotli

### 4. 想部署到子路径（`/xyzw/`）

当前 `vite.config.js` 没有设置 `base`，默认按根路径生成资源引用，**直接放子路径会白屏**。
要放子路径需要改 `vite.config.js` 加 `base: '/xyzw/'`，同时改
`src/router/index.js` 的 `createWebHistory(...)` 入参与 nginx `alias`。
这属于对外契约变更（`architecture.contract.json` 里的 `routes`），改完要跑
`npm run verify`。没有强需求就放在独立域名或根路径。

### 5. 反向代理的 TLS 校验

`deploy/nginx.conf` 里对游戏/微信上游写了 `proxy_ssl_verify off`：这些上游用的是
自家或非常规证书链，开启严格校验在部分发行版上会握手失败。要更严就装上游根证书
并打开校验。

### 6. `/api/proxy` 为什么需要一个小进程

前端发的是 `/api/proxy?url=<encodeURIComponent(源地址)>`，实际到达 nginx 的
query 是 `https%3A%2F%2Fexample.com%2F`。nginx 的 `$arg_url` **不做 URL 解码**，
写 `proxy_pass $arg_url;` 会直接报 `invalid URL prefix in "https%3A%2F%2F..."`（500）。
nginx 原生没有 unescape 能力（要 njs 或 Lua），所以这里用一个零依赖的 Node 小进程
解码后拉流：

- Docker：compose 的 `proxy` 服务，与 web 共享网络命名空间，监听 `127.0.0.1:3001`
- 裸机：`deploy.sh` 检测到 node ≥ 18 就装 `xyzw-proxy.service`（代码在 `/opt/xyzw-proxy`）
- 都没有：`/api/proxy` 返回 502，登录、连接、任务这些功能完全不受影响

该进程默认拦截内网/回环目标（防 SSRF）。要代理同机的 Python Token 服务
（`127.0.0.1:5000`），把 compose 里的 `ALLOW_PRIVATE` 改成 `"1"`，或改 systemd
unit 里的同名环境变量后 `systemctl restart xyzw-proxy`。

### 7. 可选：配套的 Python Token 服务

`server/` 下还有一个 Flask 服务（bin 文件管理 + 生成 Token URL），需要单独跑：

```bash
cd server
pip install -r requirements.txt
python app.py          # 0.0.0.0:5000，默认账号 admin / admin123
```

首次启动会生成 `server/config.json`，**务必改掉默认密码**。部署方式和上面一样，
用 systemd 或 supervisor 托管即可。`render-backend/` 是另一套 Express + Supabase
的自动化后端（需要 `SUPABASE_URL` / `SUPABASE_KEY` 环境变量），本项目不依赖它。

---

## 部署后自检清单

```bash
# 1. 首页 200 且是 index.html
curl -sI http://<域名>/ | head -1

# 2. SPA 深层路由不 404（应返回 index.html）
curl -s -o /dev/null -w '%{http_code}\n' http://<域名>/admin/daily-tasks

# 3. 静态资源带缓存头
curl -sI http://<域名>/assets/$(ls dist/assets | head -1) | grep -i cache-control

# 4. 四条反代都通（非 404、非 502）
curl -s -o /dev/null -w 'hortor-ucenter %{http_code}\n' \
  'http://<域名>/api/hortor-ucenter/ucenter-app-server/api/v1/login/verify/code'
curl -s -o /dev/null -w 'weixin %{http_code}\n' \
  'http://<域名>/api/weixin/connect/qrconnect?appid=x&redirect_uri=y'
curl -s -o /dev/null -w 'weixin-long %{http_code}\n' \
  'http://<域名>/api/weixin-long/connect/l/qrconnect?uuid=x'
curl -s -o /dev/null -w 'hortor %{http_code}\n' \
  'http://<域名>/api/hortor/comb-login-server/api/v1/login'

# 5. /api/proxy 解码代理（200 正常；502 = 解码进程没起）
curl -s -o /dev/null -w 'proxy %{http_code}\n' \
  'http://<域名>/api/proxy?url=https%3A%2F%2Fexample.com%2F'
```

> 四条登录接口用 GET 空参数探测时，上游会返回 404 —— **这不是部署失败**。
> 判断链路是否通，看响应头里有没有 `Via: kong/2.5.1` / `X-Kong-Proxy-Latency`：
> 有，说明请求已经打到上游网关，nginx 这段是好的。真正的验证是带 body 的 POST：
>
> ```bash
> curl -s -o /dev/null -w '%{http_code}\n' -X POST \
>   -H 'Content-Type: application/json' -d '{"phone":"13800000000","type":1}' \
>   'http://<域名>/api/hortor-ucenter/ucenter-app-server/api/v1/login/verify/code'
> # 200 = 反代 + 上游都正常
> ```

浏览器控制台里再确认：导入 Token 后 WebSocket 能握手成功（Network → WS），
手机号获取验证码、微信扫码页能正常打开。

---

## 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 首页白屏、控制台 `Failed to load module /assets/xxx.js` | 部署在子路径但没设 `base` | 见「配置要点 4」 |
| 刷新 `/admin/xxx` 404 | 缺 SPA 回退 | `try_files $uri $uri/ /index.html` |
| 手机号登录 404 / 502 | 少了 `/api/hortor-ucenter` 反代，或 `proxy_ssl_name` 没设 | 见「配置要点 1」 |
| 微信扫码页空白 | 302 的 `Location` 指向上游域名 | 加 `proxy_redirect` |
| 扫码回调一直 pending | `/api/weixin-long` 被缓冲或超时太短 | `proxy_buffering off` + 120s |
| URL 导入 Token 返回 502 | `/api/proxy` 解码服务没起 | Docker 方案看 `proxy` 服务是否 running；裸机看 `systemctl status xyzw-proxy` |
| 发版后仍是旧页面 | `index.html` 被缓存 | `index.html` 设 no-cache，哈希资源长缓存 |
| 4.7MB 主 chunk 加载慢 | 没开 gzip/br | nginx gzip 已开；CDN 开 Brotli |

---

## 附：本机实测记录

2026-10-25，用 `nginx:1.27-alpine` 挂载 `dist/` 与 `deploy/nginx.conf` 实测
（`dist/` 为当前仓库构建产物）：

| 检查项 | 结果 |
|---|---|
| `nginx -t` | syntax is ok / test is successful |
| `GET /` | 200 `text/html` |
| `GET /admin/daily-tasks`（SPA 回退） | 200 |
| `GET /assets/index-*.js` | 200，`Cache-Control: public, max-age=31536000, immutable`（单条，无重复） |
| 4.5 MB 主 chunk | gzip 后 1.26 MB |
| `GET /index.html` | `no-cache, no-store, must-revalidate` |
| `POST /api/hortor-ucenter/ucenter-app-server/api/v1/login/verify/code` | 200（上游正常响应） |
| `GET /api/weixin/connect/qrconnect?...` | 200 |
| `GET /api/weixin-long/connect/l/qrconnect?uuid=x` | 400（上游对空 uuid 的回应，链路已通） |
| `GET /api/proxy?url=https%3A%2F%2Fexample.com%2F` | 200 |
| `GET /api/proxy?url=http%3A%2F%2F127.0.0.1%2F` | 403（SSRF 拦截生效） |
| `GET /api/proxy`（无参数） | 400 |
| `GET /.git/config` | 403 |
| `GET /_worker.js` | 404 |

---

## 单机多项目共存（推荐形态）

一台机器要放多个项目时，**不要**在每个项目里各自抢 80/443。分层：

```
公网 :80/:443
   │
   ├─ 入口层：宿主机 nginx（或 1Panel / 宝塔的网站功能）——只管 域名分发 + 证书
   │
   ├─ 运行层：每个项目一个容器，只绑 127.0.0.1:<端口>，外网碰不到
   │     xyzw      -> 127.0.0.1:8080
   │     project-b -> 127.0.0.1:8081
   │     project-c -> 127.0.0.1:8090
   └─ 数据层：容器内卷 / 宿主机目录，别把数据放在容器层
```

### 目录与端口约定

```
/opt/apps/
├── xyzw/                 # 本仓库
│   └── deploy/docker-compose.yml
├── project-b/
└── project-c/
```

```yaml
# 每个项目的 compose 都这么绑，端口只对本机开放
ports:
  - "127.0.0.1:8080:80"
```

记得改 `container_name` / `image` 名字，不同项目不能重名。

### 入口层加一个站点（以 xyzw 为例）

```nginx
# /etc/nginx/conf.d/xyzw.example.com.conf
server {
    listen 80;
    server_name xyzw.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 让容器内 nginx 保留原始请求路径与 query
        proxy_pass_request_headers on;
    }
}
```

`/api/*` 不用在入口层单独配——容器内的 nginx（`deploy/nginx.conf`）已经处理了四条
登录反代和 `/api/proxy`，入口层整站转发即可。这也是**容器内保留自带 nginx**的理由：
每个项目自洽，换台机器或换域名都不需要改入口层之外的东西。

HTTPS 用 `certbot --nginx -d xyzw.example.com`，或面板里一键申请。

### 面板怎么选

- **1Panel**：原生就是「Docker 管理 + 网站反代 + 一键 SSL」，和这套形态最贴。
- **宝塔**：能用，但 Docker 是插件、站点配置改动会被面板重写，手写片段要放在
  「站点设置 → 配置文件」里，别用「反向代理」界面添加。
- 只要入口层，不装面板也行：`certbot` + 手写 `conf.d/*.conf`，最轻。

### 规格提醒

- 1C1G：只够跑 1 个静态站 + Docker，装了面板基本就满了
- 2C2G：3–5 个静态/轻量项目够用
- 2C4G：有 Node/Python 常驻进程、数据库时从这个起步
- 阿里云新加坡的**出网流量**单独计费，多站点 + 图片多的项目注意流量包
