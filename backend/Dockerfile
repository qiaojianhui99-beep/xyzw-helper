# backend/Dockerfile
# 单一镜像同时用于 api 与 worker（入口由 command 决定）：
#   api    : node src/api/app.js
#   worker : node src/worker/main.js
#
# 分两阶段：deps 装依赖，runtime 只带生产依赖与源码。

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --prod --frozen-lockfile=false

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
