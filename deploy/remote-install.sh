#!/usr/bin/env bash
# ============================================================================
# 远端执行：把上传到 /tmp 的产物与站点配置装进 nginx
# 由 deploy/deploy.sh 通过 scp 上传后调用，不单独手工运行。
#
#   sudo bash /tmp/xyzw-remote-install.sh <WEB_ROOT> <SITE_NAME>
# ============================================================================
set -euo pipefail

WEB_ROOT="${1:?缺少 WEB_ROOT}"
SITE_NAME="${2:-xyzw}"
DIST_TGZ="/tmp/xyzw-dist.tgz"
CONF_SRC="/tmp/xyzw.nginx.conf"
CONF_DST="/etc/nginx/conf.d/${SITE_NAME}.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 sudo 运行" >&2
  exit 1
fi

# 1) 静态文件
mkdir -p "$WEB_ROOT"
tar xzf "$DIST_TGZ" -C "$WEB_ROOT"
chown -R root:root "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} +
find "$WEB_ROOT" -type f -exec chmod 644 {} +

# 2) 站点配置：把镜像内路径替换成真实 Web 根目录
sed "s|/app/web|${WEB_ROOT}|g" "$CONF_SRC" > "$CONF_DST"

# 3) /api/proxy 解码代理（可选：服务器有 node ≥18 才装，没有就跳过，只是该功能 502）
if [ -f /tmp/xyzw-proxy-server.mjs ] && command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
  install -d -m 755 /opt/xyzw-proxy
  install -m 644 /tmp/xyzw-proxy-server.mjs /opt/xyzw-proxy/server.mjs
  cat > /etc/systemd/system/xyzw-proxy.service <<UNIT
[Unit]
Description=XYZW Web Helper /api/proxy decoder
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/xyzw-proxy
ExecStart=${NODE_BIN} /opt/xyzw-proxy/server.mjs
Environment=PORT=3001
Environment=HOST=127.0.0.1
Environment=ALLOW_PRIVATE=0
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now xyzw-proxy >/dev/null 2>&1 || true
  systemctl restart xyzw-proxy >/dev/null 2>&1 || true
  echo "[ok] /api/proxy 解码代理已启动（systemd: xyzw-proxy）"
else
  echo "[skip] 未检测到 node，/api/proxy 未启动（只影响“URL 导入/刷新 Token”）"
fi

# 4) 语法检查 + 热加载
nginx -t
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload nginx
elif command -v nginx >/dev/null 2>&1; then
  nginx -s reload
fi

# 5) 清理
rm -f "$DIST_TGZ" "$CONF_SRC" /tmp/xyzw-proxy-server.mjs

echo "[ok] 已部署到 ${WEB_ROOT}，站点配置 ${CONF_DST}"
