#!/usr/bin/env bash
# ============================================================================
# XYZW Web Helper —— 一键部署到自建 VPS（本地构建 + 上传 + nginx 热加载）
#
# 用法：
#   bash deploy/deploy.sh <user@host> [WEB_ROOT] [SITE_NAME]
#
# 例子：
#   bash deploy/deploy.sh root@1.2.3.4
#   bash deploy/deploy.sh deploy@example.com /var/www/xyzw xyzw
#
# 前置条件：
#   - 服务器已装 nginx；部署账号有 sudo 权限
#   - 服务器已放行 80/443；域名已解析到该 IP（可选，纯 IP 也能跑）
#   - 本机已 pnpm install
# ============================================================================
set -euo pipefail

TARGET="${1:-}"
WEB_ROOT="${2:-/var/www/xyzw}"
SITE_NAME="${3:-xyzw}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "$TARGET" ]; then
  echo "用法: bash deploy/deploy.sh <user@host> [WEB_ROOT] [SITE_NAME]" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "==> [1/5] 构建"
npm run build

echo "==> [2/5] 打包 dist"
TMP_TGZ="$(mktemp -t xyzw-dist).tgz"
tar czf "$TMP_TGZ" -C dist .

echo "==> [3/5] 上传产物与配置到 ${TARGET}"
scp -q "$TMP_TGZ" "${TARGET}:/tmp/xyzw-dist.tgz"
scp -q deploy/nginx.conf "${TARGET}:/tmp/xyzw.nginx.conf"
scp -q deploy/remote-install.sh "${TARGET}:/tmp/xyzw-remote-install.sh"
scp -q deploy/proxy-service/server.mjs "${TARGET}:/tmp/xyzw-proxy-server.mjs"
rm -f "$TMP_TGZ"

echo "==> [4/5] 服务器端安装（可能需要输入 sudo 密码）"
ssh -t "$TARGET" "sudo bash /tmp/xyzw-remote-install.sh '${WEB_ROOT}' '${SITE_NAME}'"

echo "==> [5/5] 冒烟检查"
ssh "$TARGET" "curl -s -o /dev/null -w 'index.html        -> %{http_code}\n' http://127.0.0.1/"
ssh "$TARGET" "curl -s -o /dev/null -w 'SPA 深层路由      -> %{http_code}\n' http://127.0.0.1/admin/daily-tasks"
ssh "$TARGET" "curl -s -o /dev/null -w '/api/proxy        -> %{http_code}\n' 'http://127.0.0.1/api/proxy?url=https%3A%2F%2Fexample.com%2F'"

cat <<EOF

[done] 部署完成
  站点根目录 : ${WEB_ROOT}
  nginx 配置 : /etc/nginx/conf.d/${SITE_NAME}.conf
  /api/proxy : systemd 单元 xyzw-proxy（需要 node ≥ 18）
  访问地址   : http://<服务器IP或域名>/

登录功能依赖的代理（配置已内置），返回带 Via: kong 的 4xx 说明链路已通：
  /api/hortor-ucenter/*  /api/hortor/*  /api/weixin/*  /api/weixin-long/*
EOF
