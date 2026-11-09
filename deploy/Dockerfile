# ============================================================================
# XYZW Web Helper —— 生产镜像（多阶段构建）
#
# 在项目根目录执行：
#   docker build -f deploy/Dockerfile -t xyzw-web-helper:latest .
#   docker run -d --name xyzw -p 8080:80 --restart unless-stopped xyzw-web-helper:latest
#
# 或直接用 compose：
#   docker compose -f deploy/docker-compose.yml up -d --build
# ============================================================================

# ---------- 构建阶段 ----------
FROM node:24-alpine AS build

WORKDIR /app

# 先只拷贝依赖清单，命中缓存。
# 注意：仓库是 pnpm workspace（根 + backend），根 lockfile 含 backend 的 importer，
# 因此必须把 pnpm-workspace.yaml 与 backend/package.json 一起拷进来，否则
# `--frozen-lockfile` 会因为「清单缺失 / lockfile 与工作区不匹配」直接失败。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate \
 && pnpm install --frozen-lockfile

# 再拷源码
COPY . .

# 生成 dist/（worker.js 会被 closeBundle 钩子复制成 dist/_worker.js）
RUN pnpm build

# ---------- 运行阶段 ----------
FROM nginx:1.27-alpine

# 站点配置（含 4 条登录反代 + /api/proxy + SPA 回退 + gzip）
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# 静态产物
COPY --from=build /app/dist /app/web

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
