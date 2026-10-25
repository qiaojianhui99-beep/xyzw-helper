/**
 * `presetteam_getinfo` 响应归一化。
 *
 * 服务端在不同版本/不同入口下，当前阵容 id 的位置并不固定，已知形态至少有：
 *   1. { presetTeamInfo: { useTeamId: 1, presetTeamInfo: { "1": {...} } } }  // 经典双层
 *   2. { presetTeamInfo: { presetTeamInfo: { useTeamId: 1, "1": {...} } } }   // id 下沉一层
 *   3. { useTeamId: 1, presetTeamInfo: { "1": {...} } }                        // id 与队伍表平级
 *   4. { presetTeamInfo: { useTeamId: "2", ... } }                            // id 是数字字符串
 *   5. ProtoMsg 包装（带 rawData 惰性 getter）或 { data: ... } / { body: ... }
 *
 * 因此任何读取「当前阵容」的代码都不该直接 `res.presetTeamInfo.useTeamId`，
 * 一律走这里，拿到 `useTeamId: number | null`，并把 null 当成「服务器没给」而不是致命错误。
 */

/** 归一化 key 后再匹配：去掉下划线/连字符，忽略大小写 */
const TEAM_ID_KEY = /^(?:use|used|using|cur|current|select|selected|default|active)?teamid$/;

const MAX_DEPTH = 8;

const normalizeKey = (key) =>
  String(key ?? "")
    .replace(/[_\-\s]/g, "")
    .toLowerCase();

const isTeamIdKey = (key) => TEAM_ID_KEY.test(normalizeKey(key));

const toTeamId = (value) => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const id = Number(value.trim());
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  return null;
};

/** 剥掉 ProtoMsg / data / body 之类的包装，拿到真正的业务对象。 */
export function unwrapPresetTeamPayload(payload) {
  let node = payload;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (!node || typeof node !== "object") return node;
    if (node.rawData && typeof node.rawData === "object") {
      node = node.rawData;
      continue;
    }
    if (node._rawData && typeof node._rawData === "object") {
      node = node._rawData;
      continue;
    }
    break;
  }
  return node;
}

/**
 * 广度优先搜索当前阵容 id：浅层的 `useTeamId` 一定比队伍表里的 `teamId` 更可信。
 * @param {unknown} node 待搜索对象
 * @returns {number|null} 正整数阵容 id；未找到返回 null
 */
export function findUseTeamId(node) {
  const root = unwrapPresetTeamPayload(node);
  if (!root || typeof root !== "object") return null;

  const queue = [{ node: root, depth: 0 }];
  const seen = new Set();
  while (queue.length > 0) {
    const { node: current, depth } = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (depth > MAX_DEPTH) continue;

    const entries = Object.entries(current);
    for (const [key, value] of entries) {
      if (!isTeamIdKey(key)) continue;
      const id = toTeamId(value);
      if (id !== null) return id;
    }
    for (const [, value] of entries) {
      if (value && typeof value === "object") {
        queue.push({ node: value, depth: depth + 1 });
      }
    }
  }
  return null;
}

const isTeamDict = (node) =>
  !!node &&
  typeof node === "object" &&
  !Array.isArray(node) &&
  Object.keys(node).some((key) => /^\d+$/.test(key));

/**
 * @typedef {object} PresetTeamSummary
 * @property {number|null} useTeamId 当前阵容 id，服务器未给出时为 null
 * @property {Record<string, unknown>} teams 阵容表（key 为阵容 id）
 * @property {unknown} root 解开包装后的业务对象
 */

/**
 * @param {unknown} payload presetteam_getinfo / role_getroleinfo / 缓存的 presetTeam
 * @returns {PresetTeamSummary} 归一化结果
 */
export function normalizePresetTeamInfo(payload) {
  const root = unwrapPresetTeamPayload(payload);
  if (!root || typeof root !== "object") {
    return { useTeamId: null, teams: {}, root };
  }

  const inner = root.presetTeamInfo ?? root.presetTeam ?? root.teamInfo;
  let teams = {};
  if (isTeamDict(inner?.presetTeamInfo)) teams = inner.presetTeamInfo;
  else if (isTeamDict(inner)) teams = inner;
  else if (isTeamDict(root.presetTeamInfo)) teams = root.presetTeamInfo;

  return { useTeamId: findUseTeamId(root), teams, root };
}

const outline = (node, depth, maxDepth) => {
  if (node === null) return "null";
  if (typeof node !== "object") return typeof node;
  if (Array.isArray(node)) return `[${node.length}]`;
  const keys = Object.keys(node);
  const head = keys.slice(0, 16).join(",");
  if (depth >= maxDepth) return `{${head}${keys.length > 16 ? ",…" : ""}}`;
  const children = keys
    .filter((key) => node[key] && typeof node[key] === "object")
    .slice(0, 4)
    .map((key) => `${key}${outline(node[key], depth + 1, maxDepth)}`);
  return `{${head}${children.length ? ` | ${children.join(" ")}` : ""}}`;
};

/** 给日志用的紧凑结构描述，方便定位服务端到底返回了什么。 */
export function describePresetTeamPayload(payload) {
  const root = unwrapPresetTeamPayload(payload);
  if (root === undefined) return "undefined";
  if (root === null) return "null";
  if (typeof root !== "object") return `${typeof root}: ${String(root)}`;
  let preview = "";
  try {
    preview = JSON.stringify(root);
  } catch {
    preview = String(root);
  }
  if (preview.length > 300) preview = `${preview.slice(0, 300)}…`;
  return `结构=${outline(root, 0, 2)} preview=${preview}`;
}
