/**
 * 同步存储门面（storage facade）。
 *
 * 存在的理由：项目里有 96 处 `localStorage.getItem/setItem/removeItem`，
 * 分散在 25 个文件里，绝大多数是「读 → 立刻用」的同步用法
 * （初始化 ref、条件判断、computed 内部）。
 *
 * 若直接换成异步的云端 API，这 96 处都要加 await、改 setup 时序、
 * 把 computed 改成 watch —— 成本高且容易引入时序 bug。
 *
 * 因此这里提供**与 localStorage 完全同签名**的同步对象：
 *   - 内部维护内存镜像，get 永远同步返回
 *   - set 同时写内存 + localStorage（断网可用，行为与改造前一致）
 *   - 云端模式（已登录）下把变更防抖推送上去，业务代码无感
 *
 * 调用点只需把 `localStorage` 换成 `storage`，逻辑一行不改。
 *
 * 不同步的内容见 NEVER_SYNC：进程级/本机状态，上云会造成跨设备错误行为。
 */

const PREFIX = "xyzw:";

/**
 * 绝不上云的键：
 *   activeConnections  —— 跨标签页互斥锁，进程级状态
 *   bin_data_*         —— 本机 .bin 文件内容，可能是数百 KB 的 hex
 *   ws_connection_*    —— 运行时连接标识
 *   xyzw_chat_msg_list —— 高频写入的实时消息缓存
 *   test               —— 调试残留
 *   daily-settings:*   —— 走独立通道（见 S7：按 roleId 落表），不塞进通用 patch
 */
const NEVER_SYNC = [
  /^activeConnections$/,
  /^bin_data_/,
  /^ws_connection_/,
  /^xyzw_chat_msg_list$/,
  /^test$/,
  /^daily-settings:/,
];

/** @param {string} key */
export function isSyncable(key) {
  return !NEVER_SYNC.some((re) => re.test(key));
}

/** 内存镜像：key → string（与 localStorage 同构，值一律是字符串） */
const mirror = new Map();

let cloudMode = false;
let ready = false;
const dirty = new Set();
let flushTimer = null;
let pushFn = null;

/** @param {(patch: Record<string, string|null>) => Promise<void>} fn */
export function setCloudPusher(fn) {
  pushFn = fn;
}

export function isCloudMode() {
  return cloudMode;
}

/** 从 localStorage 建镜像。不依赖浏览器 API 的存在（测试环境可用 mock）。 */
function loadMirrorFromLocal() {
  mirror.clear();
  const ls = globalThis.localStorage;
  if (!ls) return;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k === null) continue;
    const v = ls.getItem(k);
    if (v !== null) mirror.set(k, v);
  }
}

/**
 * 启动：建镜像；已登录则拉云端全量覆盖。
 *
 * @param {{ cloud?: boolean, fetchAll?: () => Promise<Record<string, string>> }} [opts]
 */
export async function boot(opts = {}) {
  loadMirrorFromLocal();
  ready = true;

  if (opts.cloud && opts.fetchAll) {
    cloudMode = true;
    try {
      const remote = await opts.fetchAll();
      for (const [k, v] of Object.entries(remote ?? {})) {
        if (typeof v === "string") mirror.set(k, v);
      }
    } catch {
      // 拉不到就退回本地镜像：宁可不同步，也不要阻断启动
      cloudMode = false;
    }
  }
  return cloudMode;
}

/** 退出登录：回落到纯本地模式。 */
export function useLocalOnly() {
  cloudMode = false;
  dirty.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

/** 防抖推送（800ms），把一批变更合并成一次请求。 */
function scheduleFlush() {
  if (!cloudMode || !pushFn) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 800);
}

/**
 * 立即推送当前脏键。失败时重新排队，不丢数据。
 * @returns {Promise<boolean>} 是否全部成功
 */
export async function flush() {
  if (!cloudMode || !pushFn || dirty.size === 0) return true;

  /** @type {Record<string, string|null>} */
  const patch = {};
  for (const k of dirty) patch[k] = mirror.has(k) ? mirror.get(k) : null;

  try {
    await pushFn(patch);
    for (const k of Object.keys(patch)) dirty.delete(k);
    return true;
  } catch {
    // 保留 dirty，等下一次
    return false;
  }
}

/**
 * 与 window.localStorage 同签名的同步门面。
 */
export const storage = {
  /**
   * @param {string} key
   * @returns {string|null} 已存储的字符串；没有该键时返回 null（与 localStorage 一致）
   */
  getItem(key) {
    if (!ready) loadMirrorFromLocal();
    return mirror.has(key) ? mirror.get(key) : null;
  },

  /**
   * @param {string} key
   * @param {unknown} value
   */
  setItem(key, value) {
    if (!ready) loadMirrorFromLocal();
    const str = String(value);

    // 先写底层，失败（配额满等）时异常向上传播 —— 与 localStorage 行为一致。
    // 调用方（如 gameLauncher 的多开回滚）依赖这个异常来判定写入失败。
    // 只有写成功后才更新镜像，避免镜像与真实存储不一致。
    const ls = globalThis.localStorage;
    if (ls) ls.setItem(key, str);
    mirror.set(key, str);

    if (cloudMode && isSyncable(key)) {
      dirty.add(key);
      scheduleFlush();
    }
  },

  /** @param {string} key */
  removeItem(key) {
    if (!ready) loadMirrorFromLocal();
    const ls = globalThis.localStorage;
    if (ls) ls.removeItem(key);
    mirror.delete(key);
    if (cloudMode && isSyncable(key)) {
      dirty.add(key);
      scheduleFlush();
    }
  },

  /** @param {number} index */
  key(index) {
    if (!ready) loadMirrorFromLocal();
    return [...mirror.keys()][index] ?? null;
  },

  get length() {
    if (!ready) loadMirrorFromLocal();
    return mirror.size;
  },

  clear() {
    const keys = [...mirror.keys()];
    mirror.clear();
    try {
      globalThis.localStorage?.clear();
    } catch {
      /* ignore */
    }
    if (cloudMode) {
      for (const k of keys) {
        if (isSyncable(k)) dirty.add(k);
      }
      scheduleFlush();
    }
  },
};

/** 导出一份当前镜像快照（迁移/调试用）。 */
export function snapshot() {
  if (!ready) loadMirrorFromLocal();
  return Object.fromEntries(mirror.entries());
}

/** 批量写入（迁移导入用），不触发云端推送。 */
export function hydrate(entries) {
  for (const [k, v] of Object.entries(entries ?? {})) {
    if (typeof v !== "string") continue;
    mirror.set(k, v);
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* ignore */
    }
  }
}

/** 测试专用：清空内存状态。 */
export function __resetForTest() {
  mirror.clear();
  dirty.clear();
  cloudMode = false;
  ready = false;
  pushFn = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

export { PREFIX };
