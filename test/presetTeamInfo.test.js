import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describePresetTeamPayload,
  findUseTeamId,
  normalizePresetTeamInfo,
} from "../src/utils/presetTeamInfo.js";

test("classic double-nested payload resolves the active team", () => {
  const payload = {
    presetTeamInfo: {
      useTeamId: 3,
      presetTeamInfo: { 1: { teamInfo: {} }, 3: { teamInfo: {} } },
    },
  };
  const summary = normalizePresetTeamInfo(payload);
  assert.equal(summary.useTeamId, 3);
  assert.deepEqual(Object.keys(summary.teams), ["1", "3"]);
});

test("payload with the active id one level deeper still resolves", () => {
  const payload = { presetTeamInfo: { presetTeamInfo: { useTeamId: 2 } } };
  assert.equal(normalizePresetTeamInfo(payload).useTeamId, 2);
});

test("active id next to the team table resolves", () => {
  const payload = { useTeamId: 4, presetTeamInfo: { 4: { teamInfo: {} } } };
  const summary = normalizePresetTeamInfo(payload);
  assert.equal(summary.useTeamId, 4);
  assert.deepEqual(Object.keys(summary.teams), ["4"]);
});

test("numeric string ids and ProtoMsg wrappers are accepted", () => {
  assert.equal(
    normalizePresetTeamInfo({ presetTeamInfo: { useTeamId: "5" } }).useTeamId,
    5,
  );
  const wrapped = { rawData: { presetTeamInfo: { use_team_id: 2 } } };
  assert.equal(normalizePresetTeamInfo(wrapped).useTeamId, 2);
});

test("the shallowest matching key wins over ids inside the team table", () => {
  const payload = {
    presetTeamInfo: {
      useTeamId: 1,
      presetTeamInfo: { 2: { teamId: 2, teamInfo: {} } },
    },
  };
  assert.equal(findUseTeamId(payload), 1);
});

test("payload without any usable id reports null instead of guessing", () => {
  for (const payload of [
    undefined,
    null,
    {},
    { presetTeamInfo: {} },
    { presetTeamInfo: { useTeamId: 0 } },
    { presetTeamInfo: { useTeamId: "abc" } },
    new Uint8Array([1, 2, 3]),
  ]) {
    assert.equal(
      normalizePresetTeamInfo(payload).useTeamId,
      null,
      `payload: ${String(payload)}`,
    );
  }
});

test("shape description stays short enough for a log line", () => {
  const description = describePresetTeamPayload({
    presetTeamInfo: { useTeamId: 1, presetTeamInfo: { 1: { teamInfo: {} } } },
  });
  assert.match(description, /结构=\{presetTeamInfo/);
  assert.match(description, /useTeamId/);
  assert.match(description, /presetTeamInfo\{/);
  assert.ok(description.length < 700);
  assert.equal(describePresetTeamPayload(undefined), "undefined");
});
