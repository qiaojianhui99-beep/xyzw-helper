// ============================================================================
// XYZW Web Helper —— /api/proxy 解码代理（可选 sidecar）
//
// 为什么需要它：前端（TokenManager.vue）请求的是
//   /api/proxy?url=<encodeURIComponent(源地址)>
// nginx 的 $arg_url 不做 URL 解码，变量形式 proxy_pass 会拿到
// "https%3A%2F%2Fexample.com%2F" 而报 invalid URL prefix。所以由这个进程负责
// 解码 + 拉取 + 回传，nginx 只做一次本机反代。
//
// 启动：
//   PORT=3001 ALLOW_PRIVATE=0 node deploy/proxy-service/server.mjs
//
// 环境变量：
//   PORT          监听端口，默认 3001
//   HOST          监听地址，默认 127.0.0.1（只给本机 nginx 用）
//   TIMEOUT       上游超时毫秒，默认 20000
//   ALLOW_HOSTS   逗号分隔的域名白名单；留空表示不限
//   ALLOW_PRIVATE 1 = 允许访问内网/回环地址（默认 0，拒绝）
//
// 只用 Node 内置模块，要求 Node >= 18。
// ============================================================================

import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import { Readable } from 'node:stream';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const TIMEOUT = Number(process.env.TIMEOUT || 20000);
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1';
const ALLOW_HOSTS = (process.env.ALLOW_HOSTS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...CORS,
  });
  res.end(body);
}

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  if (p[0] === 10) return true;
  if (p[0] === 127) return true;
  if (p[0] === 0) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  return false;
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // ULA
  if (v.startsWith('fe80')) return true; // link-local
  if (v.startsWith('::ffff:')) return isPrivateIPv4(v.slice(7));
  return false;
}

async function assertAllowed(target) {
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw Object.assign(new Error('unsupported protocol'), { status: 400 });
  }
  if (ALLOW_HOSTS.length && !ALLOW_HOSTS.includes(target.hostname.toLowerCase())) {
    throw Object.assign(new Error(`host not allowed: ${target.hostname}`), { status: 403 });
  }
  if (ALLOW_PRIVATE) return;

  const literal = net.isIP(target.hostname);
  if (literal === 4 && isPrivateIPv4(target.hostname)) {
    throw Object.assign(new Error('private address blocked'), { status: 403 });
  }
  if (literal === 6 && isPrivateIPv6(target.hostname)) {
    throw Object.assign(new Error('private address blocked'), { status: 403 });
  }
  if (!literal) {
    let addrs = [];
    try {
      addrs = await dns.lookup(target.hostname, { all: true, verbatim: true });
    } catch {
      throw Object.assign(new Error(`dns lookup failed: ${target.hostname}`), { status: 502 });
    }
    for (const { address, family } of addrs) {
      if (family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address)) {
        throw Object.assign(new Error('private address blocked'), { status: 403 });
      }
    }
  }
}

async function handleProxy(req, res, url) {
  const raw = url.searchParams.get('url');
  if (!raw) {
    return sendJSON(res, 400, { error: 'missing url parameter' });
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return sendJSON(res, 400, { error: 'invalid url' });
  }

  try {
    await assertAllowed(target);
  } catch (error) {
    return sendJSON(res, error.status || 400, { error: error.message });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: '*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; XYZW-Web-Helper)',
      },
    });

    const headers = {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...CORS,
    };
    const len = upstream.headers.get('content-length');
    if (len) headers['Content-Length'] = len;

    res.writeHead(upstream.status, headers);
    if (!upstream.body) {
      return res.end();
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 502;
    sendJSON(res, status, { error: `proxy failed: ${error.message}` });
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (url.pathname === '/healthz') {
    return sendJSON(res, 200, { ok: true });
  }

  if (url.pathname !== '/api/proxy') {
    return sendJSON(res, 404, { error: 'not found' });
  }

  if (req.method !== 'GET') {
    return sendJSON(res, 405, { error: 'method not allowed' });
  }

  handleProxy(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`[xyzw-proxy] listening on http://${HOST}:${PORT}  allowPrivate=${ALLOW_PRIVATE}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
