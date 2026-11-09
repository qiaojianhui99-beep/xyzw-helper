/**
 * 持久化 ref：把响应式状态接到 storage facade 上。
 *
 * 为什么不用 VueUse 的 `useLocalStorage`：
 *   它直接读写 `window.localStorage`，而 facade 维护自己的内存镜像。
 *   两条写通道并存时镜像看不到直写，云端合并会把旧值当真相 —— 同步静默失效。
 *   这里让 facade 成为唯一写入者，响应式层只订阅它的变更广播。
 *
 * 序列化规则与 VueUse 保持一致（string 原样、number/boolean 转字符串、
 * object/array 走 JSON），所以存量数据不需要迁移。
 * 只覆盖本工程实际用到的类型；Set / Map / Date 请显式序列化后再存。
 */

import type { Ref } from "vue";
import { getCurrentScope, onScopeDispose, ref, watch } from "vue";
import { storage, subscribe } from "@/api/storage";

/** 决定序列化方式的初始值类型集合 */
type PersistentInit = string | number | boolean | object | null | undefined;

interface Serializer {
  read: (raw: string) => unknown;
  write: (value: unknown) => string;
}

const SERIALIZERS: Record<string, Serializer> = {
  boolean: {
    read: (raw) => raw === "true",
    write: (value) => String(value),
  },
  number: {
    read: (raw) => Number.parseFloat(raw),
    write: (value) => String(value),
  },
  string: {
    read: (raw) => raw,
    write: (value) => String(value),
  },
  object: {
    read: (raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        // 历史脏数据（如 "[object Object]"）：当作不存在，避免整页崩在解析上
        return null;
      }
    },
    write: (value) => JSON.stringify(value),
  },
  any: {
    read: (raw) => raw,
    write: (value) => String(value),
  },
};

/**
 * 与 VueUse `guessSerializerType` 同序，保证存量数据读法不变。
 * @param init 默认值
 * @returns 序列化器名称
 */
function guessType(init: PersistentInit): string {
  if (init === null || init === undefined) return "any";
  if (typeof init === "boolean") return "boolean";
  if (typeof init === "string") return "string";
  if (typeof init === "object") return "object";
  if (!Number.isNaN(init)) return "number";
  return "any";
}

/**
 * 创建与 storage facade 双向绑定的 ref。
 *
 * - 读：初始化时从 facade 取值，键不存在时用 defaultValue
 * - 写：watch 深监听后写回 facade（facade 负责双写 localStorage 与云推送）
 * - 外变：订阅 facade 的广播，云端拉取或其他调用点的写入都会同步到 ref
 *
 * @param key 存储键（应同时登记在 architecture.contract.json 的 storageKeys）
 * @param defaultValue 键不存在时的值，同时决定序列化方式
 * @returns 响应式引用
 */
export function usePersistentRef<T>(key: string, defaultValue: T): Ref<T> {
  const serializer = SERIALIZERS[guessType(defaultValue as PersistentInit)];

  const read = (): T => {
    const raw = storage.getItem(key);
    return raw === null ? defaultValue : (serializer.read(raw) as T);
  };

  const state = ref(read()) as unknown as Ref<T>;

  watch(
    state,
    (value) => {
      if (value === null || value === undefined) {
        storage.removeItem(key);
        return;
      }
      const raw = serializer.write(value);
      // 值没变就不写：避免云端模式下无意义地标脏
      if (storage.getItem(key) !== raw) storage.setItem(key, raw);
    },
    // flush(sync)：facade 是同步语义，ref 一变就必须落到存储，
    // 否则调用方在同一 tick 内读 storage.getItem 会读到旧值。
    { deep: true, flush: "sync" },
  );

  const unsubscribe = subscribe(key, (raw) => {
    const next = raw === null ? defaultValue : (serializer.read(raw) as T);
    // 用序列化后的字符串比较，避免对象引用不同但内容相同却触发重渲染
    if (serializer.write(next) !== serializer.write(state.value)) state.value = next;
  });

  // 组件/effect scope 内调用时自动退订；模块顶层调用（store 常驻）不强制退订
  if (getCurrentScope()) onScopeDispose(unsubscribe);

  return state;
}
