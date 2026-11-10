import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import { storage } from "@/api/storage";
import { useTokenSort } from "@/composables/useTokenSort";

const tokens = [
  { id: "a", name: "beta", server: "s2", createdAt: "2026-01-02T00:00:00Z", lastUsed: "2026-03-01T00:00:00Z" },
  { id: "b", name: "Alpha", server: "s1", createdAt: "2026-01-03T00:00:00Z", lastUsed: "2026-02-01T00:00:00Z" },
  { id: "c", name: "gamma", server: "s3", createdAt: "2026-01-01T00:00:00Z", lastUsed: "2026-04-01T00:00:00Z" },
];

describe("useTokenSort", () => {
  beforeEach(() => {
    storage.removeItem("tokenSortConfig");
  });

  it("默认按 createdAt 升序", () => {
    const { sortedTokens, sortConfig } = useTokenSort(ref(tokens));
    expect(sortConfig.value).toEqual({ field: "createdAt", direction: "asc" });
    expect(sortedTokens.value.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("按 name 排序时忽略大小写", () => {
    const { sortedTokens, toggleSort } = useTokenSort(ref(tokens));
    toggleSort("name");
    expect(sortedTokens.value.map((t) => t.name)).toEqual(["Alpha", "beta", "gamma"]);
  });

  it("同一字段再次点击切换为降序", () => {
    const { sortedTokens, toggleSort, sortConfig } = useTokenSort(ref(tokens));
    toggleSort("name");
    toggleSort("name");
    expect(sortConfig.value.direction).toBe("desc");
    expect(sortedTokens.value.map((t) => t.name)).toEqual(["gamma", "beta", "Alpha"]);
  });

  it("切换字段时方向重置为升序", () => {
    const { toggleSort, sortConfig } = useTokenSort(ref(tokens));
    toggleSort("name");
    toggleSort("name"); // desc
    toggleSort("server");
    expect(sortConfig.value).toEqual({ field: "server", direction: "asc" });
  });

  it("按 lastUsed 排序", () => {
    const { sortedTokens, toggleSort } = useTokenSort(ref(tokens));
    toggleSort("lastUsed");
    expect(sortedTokens.value.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("排序配置写入 localStorage", () => {
    const { toggleSort } = useTokenSort(ref(tokens));
    toggleSort("name");
    expect(JSON.parse(storage.getItem("tokenSortConfig")!)).toEqual({
      field: "name",
      direction: "asc",
    });
  });

  it("能从 localStorage 恢复配置", () => {
    storage.setItem("tokenSortConfig", JSON.stringify({ field: "server", direction: "desc" }));
    const { sortConfig, sortedTokens } = useTokenSort(ref(tokens));
    expect(sortConfig.value).toEqual({ field: "server", direction: "desc" });
    expect(sortedTokens.value.map((t) => t.server)).toEqual(["s3", "s2", "s1"]);
  });

  it("脏数据回退到默认配置", () => {
    storage.setItem("tokenSortConfig", "{ broken");
    const { sortConfig } = useTokenSort(ref(tokens));
    expect(sortConfig.value).toEqual({ field: "createdAt", direction: "asc" });
  });

  it("缺少字段的配置也回退默认", () => {
    storage.setItem("tokenSortConfig", JSON.stringify({ field: "name" }));
    const { sortConfig } = useTokenSort(ref(tokens));
    expect(sortConfig.value).toEqual({ field: "createdAt", direction: "asc" });
  });

  it("getSortIcon 只对当前字段返回箭头", () => {
    const { getSortIcon, toggleSort } = useTokenSort(ref(tokens));
    toggleSort("name");
    expect(getSortIcon("name")).toBe("↑");
    expect(getSortIcon("server")).toBeNull();
    toggleSort("name");
    expect(getSortIcon("name")).toBe("↓");
  });

  it("支持 getter 形式的列表来源（Pinia 解包场景）", () => {
    const source = ref(tokens);
    const { sortedTokens, toggleSort } = useTokenSort(() => source.value);
    toggleSort("name");
    expect(sortedTokens.value.map((t) => t.name)).toEqual(["Alpha", "beta", "gamma"]);
    source.value = [tokens[0]!];
    expect(sortedTokens.value).toHaveLength(1);
  });

  it("支持直接传数组", () => {
    const { sortedTokens } = useTokenSort(tokens);
    expect(sortedTokens.value).toHaveLength(3);
  });

  it("缺字段的 token 排序不抛错", () => {
    const { sortedTokens, toggleSort } = useTokenSort(ref([{}, { name: "x" }] as never));
    toggleSort("name");
    expect(sortedTokens.value).toHaveLength(2);
  });
});
