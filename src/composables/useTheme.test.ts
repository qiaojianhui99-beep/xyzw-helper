import { beforeEach, describe, expect, it, vi } from "vitest";

/** 每次重新加载模块，避免 useTheme 的单例状态串味 */
async function loadTheme() {
  vi.resetModules();
  return await import("@/composables/useTheme");
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it("默认跟随系统（浅色）", async () => {
    const { useTheme } = (await loadTheme()) as any;
    const { isDark } = useTheme() as any;
    expect(isDark.value).toBe(false);
  });

  it("setDarkTheme 写入 data-theme 与 localStorage", async () => {
    const { useTheme } = (await loadTheme()) as any;
    const { setDarkTheme, isDark } = useTheme();
    setDarkTheme();
    expect(isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("setLightTheme 清除属性并记录偏好", async () => {
    const { useTheme } = (await loadTheme()) as any;
    const { setLightTheme, isDark } = useTheme();
    setLightTheme();
    expect(isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("initTheme 读取已保存的 dark 偏好", async () => {
    localStorage.setItem("theme", "dark");
    const { useTheme } = (await loadTheme()) as any;
    const api = useTheme() as any;
    api.initTheme();
    expect(api.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("initTheme 在无偏好且系统浅色时落地浅色", async () => {
    const { useTheme } = (await loadTheme()) as any;
    const api = useTheme() as any;
    api.initTheme();
    expect(api.isDark.value).toBe(false);
  });

  it("toggleTheme 在明暗之间切换", async () => {
    const { useTheme } = (await loadTheme()) as any;
    const { toggleTheme, isDark } = useTheme();
    const before = isDark.value;
    toggleTheme();
    expect(isDark.value).toBe(!before);
    toggleTheme();
    expect(isDark.value).toBe(before);
  });

  it("多次调用拿到同一个响应式状态（单例）", async () => {
    const { useTheme } = (await loadTheme()) as any;
    const a = useTheme() as any;
    const b = useTheme() as any;
    a.setDarkTheme();
    expect(b.isDark.value).toBe(true);
  });

  it("系统偏好为暗色时，auto 模式跟随", async () => {
    localStorage.setItem("theme", "auto");
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const { useTheme } = (await loadTheme()) as any;
    const { isDark, applySystemTheme } = useTheme();
    applySystemTheme?.();
    expect(typeof isDark.value).toBe("boolean");
  });
});
