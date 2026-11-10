/**
 * vitest 全局准备：补 jsdom 缺的浏览器 API，并清掉测试间的持久化残留。
 *
 * 不 mock 业务代码，只补运行时能力 —— 测试里该显式 mock 的依赖仍逐个 mock。
 */
import { afterEach, beforeEach, vi } from "vitest";

// jsdom 没有 matchMedia / ResizeObserver，naive-ui 与主题逻辑要用
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// scrollTo / scrollIntoView 在 jsdom 里是空实现，组件挂载时可能调用
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
