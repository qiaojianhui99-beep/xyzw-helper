/**
 * 协议单源门禁（P0-2）。
 *
 * 背景：`src/utils/bonProtocol.js`（前端，1020 行）与
 * `backend/src/protocol/bonProtocol.js`（后端，766 行）是**两份实现**。
 * 2026-11 实测后端那份与 `render-backend/lib/bonProtocol.js` 的 MD5 完全相同，
 * 即后端协议层是从已弃用的半成品原样拷贝的，已经比前端落后 254 行
 * （缺 `ProtoMsgLegion`、`GameMessages`）。
 *
 * 这个测试守两件事：
 *   1. 加密开关关闭时，前后端 BON 编码**逐字节一致**；
 *   2. 前端产出的密文后端能解、后端产出的密文前端能解（三种加密通道互通）。
 *
 * 只要任一侧改了编码/加密实现而没同步另一侧，这里立刻红。
 * 长期目标是抽成共享包、删掉副本；在那之前，本文件就是唯一的一致性证据。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as back from "../backend/src/protocol/bonProtocol.js";
import * as front from "../src/utils/bonProtocol.js";

/** 覆盖实际业务里出现过的报文形状 */
const VECTORS = [
  { cmd: "role:info:get", body: { roleId: 123 } },
  { cmd: "sign_in", body: { day: 1 } },
  { cmd: "fight_level", body: { level: 88, team: [1, 2, 3], flag: true } },
  { cmd: "store_setpurchase", body: { id: 1, count: 2, price: 100 } },
  { cmd: "system_heartbeat", body: {} },
  {
    cmd: "legion:war:enter",
    body: { warId: 7, members: [{ uid: 1, name: "甲" }, { uid: 2, name: "乙" }] },
  },
  { cmd: "nested", body: { a: { b: { c: [1, [2, [3]]] } }, s: "中文串😀" } },
];

/** @param {ArrayBuffer | Uint8Array | null} buf */
function toBytes(buf) {
  if (buf == null) return null;
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

describe("BON 明文编码：前后端逐字节一致", () => {
  for (const vector of VECTORS) {
    it(vector.cmd, () => {
      const a = toBytes(front.bon.encode(vector, false));
      const b = toBytes(back.bon.encode(vector, false));
      assert.ok(a && b, "编码结果不能为空");
      assert.deepEqual(
        [...a],
        [...b],
        `编码不一致：${vector.cmd}`,
      );
    });
  }
});

describe("BON 明文解码：前后端互相解得开", () => {
  for (const vector of VECTORS) {
    it(vector.cmd, () => {
      const encodedByFront = toBytes(front.bon.encode(vector, false));
      const decodedByBack = back.bon.decode(encodedByFront);
      assert.deepEqual(decodedByBack, front.bon.decode(encodedByFront));

      const encodedByBack = toBytes(back.bon.encode(vector, false));
      assert.deepEqual(front.bon.decode(encodedByBack), decodedByBack);
    });
  }
});

const ENCODINGS = ["lx", "x", "xtm"];

describe("三种加密通道：前后端密文互通", () => {
  for (const name of ENCODINGS) {
    it(`${name}：前端加密 → 后端解密`, () => {
      for (const vector of VECTORS) {
        const cipher = toBytes(front.encode(vector, front.getEnc(name)));
        const plain = back.getEnc(name).decrypt(cipher);
        const decoded = back.bon.decode(toBytes(plain));
        assert.deepEqual(decoded, front.bon.decode(toBytes(front.bon.encode(vector, false))), `${name}/${vector.cmd}`);
      }
    });

    it(`${name}：后端加密 → 前端解密`, () => {
      for (const vector of VECTORS) {
        const cipher = toBytes(back.encode(vector, back.getEnc(name)));
        const plain = front.getEnc(name).decrypt(cipher);
        const decoded = front.bon.decode(toBytes(plain));
        assert.deepEqual(decoded, back.bon.decode(toBytes(back.bon.encode(vector, false))), `${name}/${vector.cmd}`);
      }
    });
  }
});

/**
 * 默认通道（getEnc(undefined)）实际走 `x`：XOR 密钥每次随机，
 * 因此**不能比较密文字节**，只能比较解密后的明文。
 * 同理 lx 的掩码位也来自 Math.random()，任何"两次加密字节相同"的断言都是错的。
 */
describe("默认通道（passthrough → x）两端互通", () => {
  it("前端默认加密 → 后端默认解密", () => {
    for (const vector of VECTORS) {
      const cipher = toBytes(front.encode(vector, front.getEnc(undefined)));
      const decoded = back.bon.decode(toBytes(back.getEnc(undefined).decrypt(cipher)));
      assert.deepEqual(decoded, front.bon.decode(toBytes(front.bon.encode(vector, false))), vector.cmd);
    }
  });

  it("后端默认加密 → 前端默认解密", () => {
    for (const vector of VECTORS) {
      const cipher = toBytes(back.encode(vector, back.getEnc(undefined)));
      const decoded = front.bon.decode(toBytes(front.getEnc(undefined).decrypt(cipher)));
      assert.deepEqual(decoded, back.bon.decode(toBytes(back.bon.encode(vector, false))), vector.cmd);
    }
  });

  it("同一报文两次加密的密文不同（随机密钥，防止误写字节比较）", () => {
    const vector = VECTORS[0];
    const a = toBytes(front.encode(vector, front.getEnc(undefined)));
    const b = toBytes(front.encode(vector, front.getEnc(undefined)));
    assert.notDeepEqual([...a], [...b]);
  });
});

/**
 * 能力对齐：后端副本此前缺 ProtoMsgLegion / GameMessages，军团战报文与预置模板
 * 在服务端无法构造。2026-11 已补齐，这里用「导出集合一致」把它锁住 ——
 * 谁再只在一侧加导出，测试就红。
 */
describe("两端导出的协议能力一致", () => {
  const CORE_EXPORTS = [
    "BonDecoder",
    "BonEncoder",
    "DataReader",
    "DataWriter",
    "GameMessages",
    "Int64",
    "ProtoMsg",
    "ProtoMsgLegion",
    "bon",
    "encode",
    "g_utils",
    "getEnc",
    "parse",
  ];

  it("核心导出在两侧都存在", () => {
    for (const name of CORE_EXPORTS) {
      assert.notEqual(front[name], undefined, `前端缺少导出 ${name}`);
      assert.notEqual(back[name], undefined, `后端缺少导出 ${name}`);
    }
  });

  it("GameMessages 的报文模板集合完全一致", () => {
    assert.deepEqual(
      Object.keys(back.GameMessages).sort(),
      Object.keys(front.GameMessages).sort(),
    );
  });

  it("ProtoMsgLegion 对同一报文的解析结果一致", () => {
    const raw = {
      ack: 1,
      cmd: "Legion_War_Enter",
      code: 0,
      seq: 7,
      time: 1700000000000,
      body: { warId: 3 },
    };
    const a = new front.ProtoMsgLegion(raw);
    const b = new back.ProtoMsgLegion(raw);
    assert.equal(b.cmd, a.cmd, "cmd 应统一小写");
    assert.equal(b.seq, a.seq);
    assert.equal(b.ack, a.ack);
    assert.equal(b.code, a.code);
    assert.deepEqual(b.body, a.body);
  });

  it("GameMessages 的同一模板产出相同报文", () => {
    for (const name of Object.keys(front.GameMessages)) {
      const a = front.GameMessages[name](1, 2, {});
      const b = back.GameMessages[name](1, 2, {});
      assert.equal(b.cmd, a.cmd, `${name} 的 cmd 不一致`);
      assert.equal(b.seq, a.seq, `${name} 的 seq 不一致`);
      assert.equal(b.ack, a.ack, `${name} 的 ack 不一致`);
    }
  });
});
