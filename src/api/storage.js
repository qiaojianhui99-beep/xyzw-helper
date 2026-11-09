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
 * 唯一写入者原则（2026-11 收口）：
 *   本模块是这批键的**唯一**写入通道。响应式层通过
 *   `usePersistentRef`（src/composables/usePersistentRef.ts）订阅变更，
 *   不再保留 VueUse `useLocalStorage` 直写 window.localStorage 的第二条通道。
 *   两条通道并存时，镜像看不到直写、云端合并会拿旧值当真相，同步静默失效。
 *
 * 键名不加前缀：`gameTokens` 就是 `localStorage["gameTokens"]`，
 * 与改造前的存量数据天然兼容，无需迁移。
 */

/*
 * 不上云的键：进程级/本机状态，上云会造成跨设备错误行为。
 * 注意：`NEVER_SYNC` 只表示「不推送云端」，这些键**仍然进内存镜像**
 * （否则 storage.getItem 会与 localStorage 不一致，读到的永远比真实值旧）。
 */
const NEVER_SYNC = [
  /^activeConnections$/, // 跨标签页互斥锁，进程级状态
  /^bin_data_/, // 本机 .bin 文件内容，可能是数百 KB 的 hex
  /^ws_connection_/, // 运行时连接标识
  /^xyzw_chat_msg_list$/, // 高频写入的实时消息缓存
  /^test$/, // 调试残留
  /^daily-settings:/, // 走独立通道（见 S7：按 roleId 落表）
  /^__storageLastWriteAt$/, // 本机写入时间戳，只用于合并判序，不应跨设备
  /^multi-game:/, // 多开会话的 scoped 键：只属于本机某个会话，别的设备拿到无意义
];

/** 内存镜像：key → string（与 localStorage 同构，值一律是字符串） */
const mirror = new Map();

/** 订阅者：key → Set<fn>。facade 写入后在这里广播给响应式层。 */
const listeners = new Map();

/**
 * 本机写入时间戳：key → epoch ms。
 * 只用于启动合并时判断「本地这份是不是更新的」，本身不参与业务。
 * 需跨会话保留（否则每次刷新都会被旧云端值覆盖一次），因此落在一个内部键里。
 */
const lastWriteAt = new Map();
const WRITE_AT_KEY = "__storageLastWriteAt";
let cloudMode = false;
let ready = false;
const dirty = new Set();
let flushTimer = null;
let pushFn = null;

/**
 * 该键是否允许推送云端。
 * @param {string} key 存储键
 * @returns {boolean} true = 参与云同步
 */
export function isSyncable(key) {
  return !NEVER_SYNC.some((re) => re.test(key));
}

/**
 * 订阅某个键的变更（facade 内部写入、云端拉取都会触发）。
 * @param {string} key 存储键
 * @param {(raw: string | null) => void} fn 收到变更后的原始字符串（删除时为 null）
 * @returns {() => void} 取消订阅
 */
export function subscribe(key, fn) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * 广播某个键的当前值。
 * @param {string} key 存储键
 */
function notify(key) {
  const set = listeners.get(key);
  if (!set || set.size === 0) return;
  const raw = mirror.has(key) ? mirror.get(key) : null;
  for (const fn of set) {
    try {
      fn(raw);
    } catch {
      // 订阅者异常不能影响其他订阅者和写入流程
    }
  }
}

/**
 * 注册云端推送函数。
 * @param {(patch: Record<string, string | null>) => Promise<void>} fn 推送器
 */
export function setCloudPusher(fn) {
  pushFn = fn;
}

/** @returns {boolean} true = 当前处于云端同步模式 */
export function isCloudMode() {
  return cloudMode;
}

/** 从镜像里的内部键恢复写入时间戳。 */
function loadWriteTimes() {
  lastWriteAt.clear();
  const raw = mirror.get(WRITE_AT_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed ?? {})) {
      if (typeof v === "number") lastWriteAt.set(k, v);
    }
  } catch {
    // 脏数据：丢弃即可，最坏情况只是合并时退化为「保留本地」
  }
}

/** 把写入时间戳写回内部键（绕过 storage.setItem，避免自触发）。 */
function persistWriteTimes() {
  const raw = JSON.stringify(Object.fromEntries(lastWriteAt));
  mirror.set(WRITE_AT_KEY, raw);
  try {
    globalThis.localStorage?.setItem(WRITE_AT_KEY, raw);
  } catch {
    // 配额满：不致命，本次会话仍按内存里的时间戳合并
  }
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
 * 启动：建镜像；已登录则拉云端全量合并进来。
 *
 * 合并策略（既不丢本地写入，也能收到别的设备的新值）：
 *   - 云端有、本地没有            → 采纳云端
 *   - 两边相同                    → 跳过
 *   - 两边不同且云端 updatedAt 更新 → 采纳云端
 *   - 两边不同且本地写入更晚       → 保留本地，标脏等回传
 *   - 云端没带 updatedAt（旧后端） → 保留本地，标脏（宁可回传也不要被静默覆盖）
 *   updatedAt 由后端 `/api/storage/all` 返回，见 backend/src/api/routes/storage.js。
 *
 * @param {{ cloud?: boolean, fetchAll?: () => Promise<Record<string, unknown>> }} [opts] 启动选项
 * @returns {Promise<boolean>} true = 已进入云端模式
 */
export async function boot(opts = {}) {
  loadMirrorFromLocal();
  loadWriteTimes();
  ready = true;

  if (opts.cloud && opts.fetchAll) {
    cloudMode = true;
    try {
      const remote = (await opts.fetchAll()) ?? {};
      const localKeys = new Set(mirror.keys());

      for (const [k, entry] of Object.entries(remote)) {
        const remoteValue =
          entry && typeof entry === "object" && "value" in entry
            ? /** @type {{ value: unknown }} */ (entry).value
            : entry;
        if (typeof remoteValue !== "string") continue;

        if (!localKeys.has(k)) {
          mirror.set(k, remoteValue);
          try {
            globalThis.localStorage?.setItem(k, remoteValue);
          } catch {
            // 配额满：镜像仍是新值，本次会话可用
          }
          notify(k);
          continue;
        }

        if (mirror.get(k) === remoteValue) continue;

        // 两边都有值且不同：谁更新听谁的。本地没有时间戳时按「保留本地」处理 ——
        // 宁可回传上传也不要被旧云端值静默覆盖。
        const remoteAt =
          entry && typeof entry === "object" && "updatedAt" in entry
            ? Date.parse(String(entry.updatedAt)) || 0
            : 0;
        const localAt = lastWriteAt.get(k) ?? 0;

        if (remoteAt > localAt) {
          mirror.set(k, remoteValue);
          try {
            globalThis.localStorage?.setItem(k, remoteValue);
          } catch {
            // ignore
          }
          notify(k);
          continue;
        }

        if (isSyncable(k)) dirty.add(k);
      }

      // 有采纳的新键要广播，有保留的本地键要回传：两种情况都排一次推送
      scheduleFlush();
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

  /** @type {Record<string, string | null>} */
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
   * @param {string} key 存储键
   * @returns {string | null} 已存储的字符串；没有该键时返回 null（与 localStorage 一致）
   */
  getItem(key) {
    if (!ready) loadMirrorFromLocal();
    return mirror.has(key) ? mirror.get(key) : null;
  },

  /**
   * @param {string} key 存储键
   * @param {unknown} value 将被 String() 成字符串
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
    if (key !== WRITE_AT_KEY) {
      lastWriteAt.set(key, Date.now());
      persistWriteTimes();
    }
    notify(key);

    if (cloudMode && isSyncable(key)) {
      dirty.add(key);
      scheduleFlush();
    }
  },

  /** @param {string} key 存储键 */
  removeItem(key) {
    if (!ready) loadMirrorFromLocal();
    const ls = globalThis.localStorage;
    if (ls) ls.removeItem(key);
    mirror.delete(key);
    notify(key);
    if (cloudMode && isSyncable(key)) {
      dirty.add(key);
      scheduleFlush();
    }
  },

  /** @param {number} index 从 0 开始的序号 */
  key(index) {
    if (!ready) loadMirrorFromLocal();
    // 内部元数据键不算业务键，否则调用方按 localStorage 习惯遍历会读到它
    return Object.keys(businessView())[index] ?? null;
  },

  get length() {
    if (!ready) loadMirrorFromLocal();
    return Object.keys(businessView()).length;
  },

  clear() {
    const keys = [...mirror.keys()];
    mirror.clear();
    try {
      globalThis.localStorage?.clear();
    } catch {
      // ignore
    }
    for (const k of keys) notify(k);
    if (cloudMode) {
      for (const k of keys) {
        if (isSyncable(k)) dirty.add(k);
      }
      scheduleFlush();
    }
  },
};

/**
 * 业务键视图（排除内部元数据键）。
 * @returns {Record<string, string>} 键 → 字符串值
 */
function businessView() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of mirror.entries()) {
    if (k === WRITE_AT_KEY) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 导出一份当前镜像快照（迁移/调试用）。不含内部元数据键。
 * @returns {Record<string, string>} 键 → 字符串值
 */
export function snapshot() {
  if (!ready) loadMirrorFromLocal();
  return businessView();
}

/**
 * 批量写入（迁移导入用），不触发云端推送。
 * @param {Record<string, string>} entries 键 → 字符串值
 */
export function hydrate(entries) {
  for (const [k, v] of Object.entries(entries ?? {})) {
    if (typeof v !== "string") continue;
    mirror.set(k, v);
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      // ignore
    }
    notify(k);
  }
}

/** 测试专用：清空内存状态。 */
export function __resetForTest() {
  mirror.clear();
  listeners.clear();
  lastWriteAt.clear();
  dirty.clear();
  cloudMode = false;
  ready = false;
  pushFn = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
