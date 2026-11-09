/**
 * Token 信封加密（AES-256-GCM）。
 *
 * 设计约束：
 *   1. 明文 Token 只允许存在于三处：浏览器内存、api 处理请求的瞬间、worker 解密后的内存。
 *      绝不进日志、不进响应体、不进数据库列。
 *   2. 数据库只存 `{ v, kid, iv, tag, ct }` 这一坨密文，`kid` 支持密钥轮换。
 *   3. 解密入口全库唯一（本文件的 `open`），便于审计。
 *
 * 未配置 TOKEN_MASTER_KEY 时降级为明文透传（`encrypted: false`），
 * 仅用于本地开发，并在启动时告警。
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const VERSION = 1;

/**
 * 从配置派生密钥。接受两种输入：
 *   - base64 编码的 32 字节原始密钥（推荐，生产用）
 *   - 任意口令（开发便利）：用 scrypt 派生，salt 固定为 "xyzw-token-v1"
 */
function deriveKey(raw, kid) {
  if (!raw) return null;
  const asBuffer = Buffer.from(raw, "base64");
  if (asBuffer.length === KEY_BYTES) return asBuffer;
  return scryptSync(raw, `xyzw-token-${kid}`, KEY_BYTES);
}

const KEY = deriveKey(config.tokenMasterKey, config.tokenKeyId);

/** 当前是否处于加密模式。 */
export const encryptionEnabled = KEY !== null;

/**
 * 加密明文 Token。
 *
 * @param {string} plaintext
 * @returns {{ v: number, kid: string, iv: string, tag: string, ct: string }}
 */
export function seal(plaintext) {
  if (!KEY) {
    // 开发降级：仍然包一层结构，让上层代码不用分支
    return { v: 0, kid: "plain", iv: "", tag: "", ct: Buffer.from(String(plaintext), "utf8").toString("base64") };
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return {
    v: VERSION,
    kid: config.tokenKeyId,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
}

/**
 * 解密。密文被篡改、密钥不匹配都会抛错 —— 宁可失败，也不要静默返回错误内容。
 *
 * @param {{ v: number, kid: string, iv: string, tag: string, ct: string }} blob
 * @returns {string}
 */
export function open(blob) {
  if (!blob || typeof blob !== "object" || typeof blob.ct !== "string") {
    throw new Error("密文格式非法");
  }
  if (blob.v === 0) {
    return Buffer.from(blob.ct, "base64").toString("utf8");
  }
  if (!KEY) throw new Error("缺少 TOKEN_MASTER_KEY，无法解密");
  if (blob.kid !== config.tokenKeyId) {
    throw new Error(`密钥版本不匹配: 密文 kid=${blob.kid}, 当前 kid=${config.tokenKeyId}`);
  }
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(blob.ct, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * 判断一个值是不是本模块产出的密文结构。
 * @param {unknown} v
 */
export function isSealed(v) {
  return (
    v !== null
    && typeof v === "object"
    && typeof (/** @type {any} */ (v).ct) === "string"
    && typeof (/** @type {any} */ (v).v) === "number"
  );
}

/**
 * 只露首尾各 4 位，用于列表展示与日志。
 * @param {string} plaintext
 */
export function mask(plaintext) {
  const s = String(plaintext ?? "");
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}
