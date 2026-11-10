/**
 * 进程内请求合并缓存（同一 key 并发只发一次，其余等待同一个 Promise）。
 *
 * 历史位置是 `src/stores/cache.ts`，但它不是 Pinia store（没有 defineStore），
 * 只是一个纯工具类，且被 `utils/xyzwWebSocket.js` 使用 —— 放在 stores 下
 * 造成 utils → stores 的层次倒置。现移到 utils，旧路径保留 re-export 兼容契约。
 */
import type { App } from "vue";

const _timeout = 5 * 1000;

/** 缓存内容容器：用普通对象承载 key → CacheItem，加索引签名让动态键可推断。 */
class Content {
  [key: string]: unknown;
}

/** 等待中的调用方回调签名 */
type Waiter<T = unknown> = (value: T) => void;
type Rejecter = (reason: unknown) => void;

class CacheItem {
  private readonly _key: string;
  private _val: unknown;
  private readonly _timeout: number;
  private _ok = false;
  private readonly _reject: Rejecter[] = [];
  private readonly _resolve: Waiter[] = [];

  /**
   * @param key 缓存键
   * @param val 初始值
   * @param t 有效期（毫秒）
   */
  constructor(key: string, val: unknown, t: number = _timeout) {
    this._key = key;
    this._val = val;
    this._timeout = +new Date() + t;
  }

  get reject(): Rejecter[] {
    return this._reject;
  }

  /** 历史拼写（reslove），对外已被调用方使用，保持原样以免破坏契约 */
  get reslove(): Waiter[] {
    return this._resolve;
  }

  get timeout(): number {
    return this._timeout;
  }

  get key(): string {
    return this._key;
  }

  set val(data: unknown) {
    this._ok = true;
    this._val = data;
  }

  get val(): unknown {
    return this._val;
  }

  toJSON(): { key: string; val: unknown; timeout: number } {
    return { key: this._key, val: this._val, timeout: this._timeout };
  }

  isTimeout(): boolean {
    return this._timeout < +new Date();
  }

  isOk(): boolean {
    return this._ok;
  }
}

interface CacheConfig {
  content: Content;
  timeout: number;
}

class Cache {
  name: string;
  content: Content & Record<string, CacheItem | undefined>;
  /**
   * 历史字段：旧实现由 CacheManager.getCache 直接往实例上挂 timeout，
   * 但它不影响 Cache.get 的默认 conf（那份来自构造参数），因此保持「存了但不用」，
   * 只为让类型与既有调用点一致。
   */
  timeout?: number;
  private readonly _config: CacheConfig;

  /**
   * @param name 缓存名
   * @param options 内容容器与默认有效期
   * @param options.content 内容容器
   * @param options.timeout 默认有效期（毫秒）
   */
  constructor(
    name: string,
    { content = new Content(), timeout = _timeout }: { content?: Content; timeout?: number } = {},
  ) {
    this.name = name;
    this.content = content as Content & Record<string, CacheItem | undefined>;
    this._config = { content, timeout };
  }

  /**
   * @param key 缓存键
   * @param callback 未命中时的加载器，或直接可用的值
   * @param conf 覆盖默认有效期
   * @param conf.timeout 覆盖后的有效期（毫秒）
   * @returns 缓存值或加载结果
   */
  async get<T = unknown>(
    key: string,
    callback?: ((key: string, conf: CacheConfig) => Promise<T> | T) | Promise<T> | T,
    conf?: { timeout?: number },
  ): Promise<T> {
    const item = this.content[key];
    if (item != null) {
      if (!item.isOk()) {
        return new Promise<T>((resolve, reject) => {
          item.reslove.push(resolve as Waiter);
          item.reject.push(reject as Rejecter);
        });
      }
      if (!item.isTimeout()) {
        return item.val as T;
      }
    }
    return this.feach(key, callback, {
      ...this._config,
      ...conf,
    }) as Promise<T>;
  }

  /**
   * Populate a cache entry and settle every reader waiting for the same key.
   * @param key Cache key.
   * @param callback Loader or already available value.
   * @param conf Entry timeout configuration.
   * @param conf.timeout 覆盖后的有效期（毫秒）
   * @returns Loaded value; loader failures reject and evict the entry.
   */
  async feach<T = unknown>(
    key: string,
    callback?: ((key: string, conf: CacheConfig) => Promise<T> | T) | Promise<T> | T,
    conf: { timeout?: number } = this._config,
  ): Promise<T> {
    const oldItem = this.content[key];
    const newItem = new CacheItem(key, null, conf.timeout);
    this.content[key] = newItem;
    const waitingItems = [oldItem, newItem].filter((i): i is CacheItem => Boolean(i));
    try {
      const data =
        typeof callback === "function"
          ? await (callback as (key: string, conf: CacheConfig) => Promise<T> | T)(key, {
              ...this._config,
              ...conf,
            })
          : await callback;
      newItem.val = data;
      for (const item of waitingItems) {
        for (const resolve of item.reslove) resolve(data);
      }
      return data as T;
    } catch (error) {
      if (this.content[key] === newItem) delete this.content[key];
      for (const item of waitingItems) {
        for (const reject of item.reject) reject(error);
      }
      throw error;
    } finally {
      for (const item of waitingItems) {
        item.reject.length = 0;
        item.reslove.length = 0;
      }
    }
  }

  /**
   * @param content 新的内容容器
   */
  clean(content: Content = new Content()): void {
    this.content = content as Content & Record<string, CacheItem | undefined>;
  }
}

class CacheManager {
  content: Content & Record<string, Cache | undefined>;
  timeout: number;

  /**
   * @param content 内容容器
   * @param timeout 默认有效期
   */
  constructor(content: Content = new Content(), timeout: number = _timeout) {
    this.content = content as Content & Record<string, Cache | undefined>;
    this.timeout = timeout;
  }

  /**
   * @param name 缓存名
   * @param config 覆盖默认有效期
   * @param config.timeout 覆盖后的有效期（毫秒）
   * @returns 对应的 Cache 实例（不存在则创建）
   */
  getCache(name: string, config?: { timeout?: number }): Cache {
    let cache = this.content[name];
    if (cache == null) {
      this.content[name] = cache = new Cache(name, {
        timeout: this.timeout,
        ...config,
      });
    } else if (config?.timeout != null) {
      cache.timeout = config.timeout;
    }
    return cache;
  }

  /**
   * @param name 缓存名
   */
  delCache(name: string): void {
    delete this.content[name];
  }

  clear(): void {
    this.content = new Content() as Content & Record<string, Cache | undefined>;
  }
}

const $CacheManager = new CacheManager();

/**
 * @param vm Vue 应用实例
 */
const install = (vm: App & { prototype?: Record<string, unknown> }) => {
  if (vm.version.startsWith("3.")) {
    vm.config.globalProperties.$CacheManager = $CacheManager;
  } else if (vm.prototype) {
    vm.prototype.$CacheManager = $CacheManager;
  }
};

if (typeof window !== "undefined") {
  (window as unknown as { $CacheManager: CacheManager }).$CacheManager = $CacheManager;
}

export { $CacheManager, Cache, CacheManager, Content, install };
