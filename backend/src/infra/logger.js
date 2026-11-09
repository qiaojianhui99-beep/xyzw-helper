/**
 * 结构化日志。
 *
 * 快照里 /api/logs 的每条形如 `{ ts, level, category, message, ...meta }`，
 * 这里必须保持同样的字段名与顺序语义 —— parity 测试对 /api/logs 用的是结构断言，
 * 字段名一改就会红。
 *
 * 同时把同样内容打到 stdout（pino 风格的单行 JSON 略作简化，便于 docker logs 采集）。
 */

import process from "node:process";
import { config } from "../config.js";

/** @type {Array<Record<string, unknown>>} */
const entries = [];

/**
 * @param {"INFO"|"WARN"|"ERROR"|"DEBUG"} level
 * @param {string} category
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export function addLog(level, category, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    category,
    message,
    ...meta,
  };
  entries.unshift(entry);
  while (entries.length > config.logMax) entries.pop();

  const line = JSON.stringify({ level, category, message, ...meta });
  if (level === "ERROR") console.error(line);
  else console.log(line);
  return entry;
}

/** @param {number} limit */
export function recentLogs(limit) {
  return entries.slice(0, limit);
}

export function logCount() {
  return entries.length;
}

/** 测试用：清空内存日志。 */
export function clearLogs() {
  entries.length = 0;
}

export const logger = {
  info: (category, message, meta) => addLog("INFO", category, message, meta),
  warn: (category, message, meta) => addLog("WARN", category, message, meta),
  error: (category, message, meta) => addLog("ERROR", category, message, meta),
  debug: (category, message, meta) => addLog("DEBUG", category, message, meta),
};

export { process };
