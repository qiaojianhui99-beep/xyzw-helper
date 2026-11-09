# backend/Dockerfile
# 单一镜像同时用于 api 与 worker（入口由 command 决定）：
#   api    : node src/api/app.js
#   worker : node src/worker/main.js
#
# 分两阶段：deps 装依赖，runtime 只带生产依赖与源码。

# 注意：backend 已并入根 `pnpm-workspace.yaml`，**没有独立的 pnpm-lock.yaml**
# （锁文件统一在仓库根）。本镜像的 context 是 backend/，拿不到根 lockfile，
# 因此这里按 package.json 清单解析依赖。
#   - 好处：镜像可独立构建，不需要仓库根上下文
#   - 代价：依赖版本不锁死；要严格可复现时，请用仓库根作为 context 并
#           `pnpm install --frozen-lockfile --filter xyzw-backend...`
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate \
 && pnpm install --prod --no-lockfile

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 非 root 运行
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY sql ./sql

USER app
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/api/app.js"]
