/**
 * Token 加密层测试。
 *
 * 断言的是安全属性本身：往返一致、篡改必失败、密钥不符必失败、掩码不泄露。
 * 注意：本文件用独立进程跑，通过 TOKEN_MASTER_KEY 环境变量选择模式。
 */

import assert from "node:assert/strict";
import process from "node:process";
import { describe, it } from "node:test";

// 固定测试密钥，避免依赖外部 env（若外部已设则沿用，便于在加密模式下跑）
process.env.TOKEN_MASTER_KEY ||= Buffer.alloc(32, 7).toString("base64");
process.env.TOKEN_KEY_ID ||= "test-k1";

const { seal, open, isSealed, mask, encryptionEnabled } = await import("../src/infra/crypto.js");

// 故意用一段明显的假凭证：长度与真实 roleToken 相近（约 172 字符），
// 但内容是可读的占位文本 —— 测试只需要「像 Token 的任意字符串」，
// 绝不要用真实凭证做测试夹具。
const SAMPLE = `fake-unit-test-token-not-a-real-credential-${"A".repeat(120)}`;

describe("token crypto", () => {
  it("启用加密模式（提供了 32 字节密钥）", () => {
    assert.equal(encryptionEnabled, true);
  });

  it("seal → open 往返得到原文", () => {
    const blob = seal(SAMPLE);
    assert.equal(open(blob), SAMPLE);
  });

  it("输出结构含 v/kid/iv/tag/ct，且不含明文", () => {
    const blob = seal(SAMPLE);
    assert.deepEqual(Object.keys(blob).sort(), ["ct", "iv", "kid", "tag", "v"]);
    assert.equal(blob.v, 1);
    // kid 取自当前配置的 TOKEN_KEY_ID，不硬编码 —— 否则在 CI（test-k1）与本地（dev-k1）会不一致
    assert.equal(blob.kid, process.env.TOKEN_KEY_ID);
    assert.ok(!JSON.stringify(blob).includes(SAMPLE.slice(0, 20)), "密文里不得出现明文片段");
  });

  it("同一明文两次加密产生不同密文（随机 IV）", () => {
    const a = seal(SAMPLE);
    const b = seal(SAMPLE);
    assert.notEqual(a.ct, b.ct);
    assert.notEqual(a.iv, b.iv);
    assert.equal(open(a), open(b));
  });

  it("篡改 ct 后解密抛错（GCM 完整性校验）", () => {
    const blob = seal(SAMPLE);
    const raw = Buffer.from(blob.ct, "base64");
    raw[0] ^= 0xff;
    const tampered = { ...blob, ct: raw.toString("base64") };
    assert.throws(() => open(tampered), /authenticate|Unsupported|bad decrypt|invalid/i);
  });

  it("篡改 tag 后解密抛错", () => {
    const blob = seal(SAMPLE);
    const tag = Buffer.from(blob.tag, "base64");
    tag[0] ^= 0xff;
    assert.throws(() => open({ ...blob, tag: tag.toString("base64") }));
  });

  it("kid 不匹配时拒绝解密并说明原因", () => {
    const blob = seal(SAMPLE);
    assert.throws(() => open({ ...blob, kid: "other-k" }), /密钥版本不匹配/);
  });

  it("非法输入抛错而非返回垃圾", () => {
    assert.throws(() => open(null), /密文格式非法/);
    assert.throws(() => open({}), /密文格式非法/);
    assert.throws(() => open({ v: 1, kid: "test-k1", iv: "aa", tag: "bb", ct: "cc" }));
  });

  it("isSealed 正确识别密文结构", () => {
    assert.equal(isSealed(seal("x")), true);
    assert.equal(isSealed("plain"), false);
    assert.equal(isSealed(null), false);
    assert.equal(isSealed({ ct: "x" }), false, "缺 v 不算密文");
  });

  it("mask 只露首尾 4 位", () => {
    assert.equal(mask(SAMPLE), `${SAMPLE.slice(0, 4)}****${SAMPLE.slice(-4)}`);
    assert.equal(mask("short"), "****");
    assert.ok(!mask(SAMPLE).includes(SAMPLE.slice(10, 30)));
  });

  it("超长 Token（4KB）往返正常", () => {
    const big = "A".repeat(4096);
    assert.equal(open(seal(big)), big);
  });

  it("空字符串往返正常", () => {
    assert.equal(open(seal("")), "");
  });
});
