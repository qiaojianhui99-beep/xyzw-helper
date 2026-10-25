// Cloudflare Pages Function —— 补齐 /api/proxy?url=<编码后的源地址>
//
// 背景：worker.js（打包成 dist/_worker.js，Advanced Mode）只代理了四条游戏登录
// 接口，没有 /api/proxy。而 TokenManager.vue 的「URL 导入 / 一键刷新 Token」会请求
// /api/proxy?url=...，在 Cloudflare Pages 上会 404。
//
// 启用方式（二选一）：
//   A. 走 Pages Functions：把本文件放到项目根的 functions/api/proxy.js，
//      并且不要提交 dist/_worker.js（即关闭 Advanced Mode）。
//   B. 继续用 Advanced Mode：把下面 proxyFetch 的逻辑合并进 worker.js 的
//      路由表（prefix "/api/proxy"，走 query 参数而不是 path 前缀）。
//
// 注意：Advanced Mode 与 functions/ 目录互斥，不要同时启用。

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const raw = url.searchParams.get('url');

  if (!raw) {
    return json({ error: 'missing url parameter' }, 400);
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return json({ error: 'invalid url' }, 400);
  }

  if (!ALLOWED_PROTOCOLS.includes(target.protocol)) {
    return json({ error: 'unsupported protocol' }, 400);
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; XYZW-Web-Helper)',
      },
      redirect: 'follow',
      cf: { cacheTtl: 0 },
    });

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return json({ error: `proxy failed: ${error.message}` }, 502);
  }
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
