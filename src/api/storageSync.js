/**
 * 云端存储同步：把 src/api/storage.js 的同步门面接到后端 /api/storage/*。
 *
 * 设计原则 —— 默认零影响：
 *   未配置 apiKey 时 `bootCloudStorage()` 直接返回 false，storage 保持纯本地模式，
 *   页面行为与改造前完全一致。只有用户在设置里填入 API Key 后才会开启同步。
 *
 * 为什么不把 key 打进构建产物（VITE_API_KEY）：
 *   前端 bundle 谁都能读，把 key 编进去等于公开；放 localStorage 至少是按实例配置，
 *   且换 key 不用重新构建。
 */

import { boot, setCloudPusher, storage } from "./storage.js";

/**
 * apiKey 自身也走 storage 门面。
 *
 * 这里刻意用字面量 `"apiKey"` 而不是常量引用：
 * scripts/check-architecture.mjs 的 STORAGE_RE 只识别引号字面量，
 * 用常量会让这个键对架构契约「隐身」，等于绕过护栏。
 */
const API_KEY_STORAGE = "apiKey";

/** 后端基址：优先构建期变量，其次同源（nginx 已把 /api 反代到 api 容器）。 */
const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");

/**
 * 读取当前配置的 key。
 * @returns {string} 已配置的 API Key；未配置时为空串
 */
export function getApiKey() {
  return storage.getItem("apiKey") ?? "";
}

/** @param {string} key */
export function setApiKey(key) {
  if (key) storage.setItem("apiKey", key);
  else storage.removeItem("apiKey");
}

/** @param {string} key */
function authHeaders(key) {
  return { "x-api-key": key, "content-type": "application/json" };
}

/**
 * 拉取云端全量键值。
 * @param {string} key API Key
 * @returns {Promise<Record<string, string>>} 键 → 值（值均为字符串，与 localStorage 同构）
 */
export async function fetchAllStorage(key) {
  const res = await fetch(`${API_BASE}/api/storage/all`, { headers: authHeaders(key) });
  if (!res.ok) throw new Error(`拉取存储失败: HTTP ${res.status}`);
  return res.json();
}

/**
 * 推送一批变更。
 * @param {string} key
 * @param {Record<string, string|null>} patch
 */
export async function pushPatch(key, patch) {
  const res = await fetch(`${API_BASE}/api/storage/patch`, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({ patch }),
  });
  if (!res.ok) throw new Error(`同步存储失败: HTTP ${res.status}`);
  return res.json();
}

/** 探测后端是否可达且 key 有效。 */
export async function checkBackend() {
  const key = getApiKey();
  if (!key) return { ok: false, reason: "未配置 API Key" };
  try {
    await fetchAllStorage(key);
    return { ok: true, reason: "连接正常" };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * 启动云端同步。调用方应在 app 初始化阶段调用一次（幂等）。
 *
 * @param {{ key?: string }} [opts] 不传 key 时从 localStorage 读
 * @returns {Promise<boolean>} true = 已进入云端模式
 */
export async function bootCloudStorage(opts = {}) {
  const key = opts.key ?? getApiKey();
  if (!key) return false;

  const enabled = await boot({
    cloud: true,
    fetchAll: () => fetchAllStorage(key),
  });

  if (enabled) {
    setCloudPusher((patch) => pushPatch(key, patch));
  }
  return enabled;
}

export { API_BASE, API_KEY_STORAGE };
