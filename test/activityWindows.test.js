/**
 * 活动时间窗口的单元测试。
 *
 * 这些规则原先内联在 BatchDailyTasks.vue 里，靠手测验证，没有任何自动化覆盖。
 * 抽成纯函数后可以固定时间点断言，尤其是周五 12 点、每月第四个周日、
 * 以及 2026-03 的两处历史特判。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPower,
  getCurrentActivityWeek,
  getFourthSundayOfMonth,
  getWarGuessActivityTip,
  isArenaActivityOpen,
  isBaokuActivityOpen,
  isMengjingActivityOpen,
  isWarGuessActivityOpen,
  isWeirdTowerActivityOpen,
} from "../src/utils/batch/activityWindows.js";

/** 构造本地时间（避免 UTC 偏移影响 getDay/getHours） */
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min, 0);

describe("三周期活动周", () => {
  it("起始时间之前返回 null", () => {
    assert.equal(getCurrentActivityWeek(at(2025, 12, 1)), null);
  });

  it("起始时间是黑市周，第 8 天进入招募周，第 15 天进入宝箱周", () => {
    assert.equal(getCurrentActivityWeek(at(2025, 12, 12, 13)), "黑市周");
    assert.equal(getCurrentActivityWeek(at(2025, 12, 19, 13)), "招募周");
    assert.equal(getCurrentActivityWeek(at(2025, 12, 26, 13)), "宝箱周");
  });

  it("三周循环回来后又是黑市周", () => {
    assert.equal(getCurrentActivityWeek(at(2026, 1, 2, 13)), "黑市周");
  });
});

describe("每日活动窗口", () => {
  it("梦境活动：周日/周一/周三/周四开放，其余关闭", () => {
    assert.equal(isMengjingActivityOpen(at(2026, 3, 1)), true); // 周日
    assert.equal(isMengjingActivityOpen(at(2026, 3, 2)), true); // 周一
    assert.equal(isMengjingActivityOpen(at(2026, 3, 4)), true); // 周三
    assert.equal(isMengjingActivityOpen(at(2026, 3, 5)), true); // 周四
    assert.equal(isMengjingActivityOpen(at(2026, 3, 3)), false); // 周二
    assert.equal(isMengjingActivityOpen(at(2026, 3, 6)), false); // 周五
    assert.equal(isMengjingActivityOpen(at(2026, 3, 7)), false); // 周六
  });

  it("宝库活动：周一、周二关闭", () => {
    assert.equal(isBaokuActivityOpen(at(2026, 3, 2)), false);
    assert.equal(isBaokuActivityOpen(at(2026, 3, 3)), false);
    assert.equal(isBaokuActivityOpen(at(2026, 3, 4)), true);
    assert.equal(isBaokuActivityOpen(at(2026, 3, 1)), true);
  });

  it("竞技场：06:00 开，22:00 关", () => {
    assert.equal(isArenaActivityOpen(at(2026, 3, 2, 5, 59)), false);
    assert.equal(isArenaActivityOpen(at(2026, 3, 2, 6, 0)), true);
    assert.equal(isArenaActivityOpen(at(2026, 3, 2, 21, 59)), true);
    assert.equal(isArenaActivityOpen(at(2026, 3, 2, 22, 0)), false);
  });
});

describe("怪异咸将塔", () => {
  it("非黑市周一律关闭", () => {
    const date = at(2025, 12, 19, 13); // 招募周
    assert.equal(getCurrentActivityWeek(date), "招募周");
    assert.equal(isWeirdTowerActivityOpen(date), false);
  });

  it("黑市周的周五必须 12:00 之后", () => {
    // 2025-12-12 是黑市周起点，当天是周五
    assert.equal(isWeirdTowerActivityOpen(at(2025, 12, 12, 11, 59)), false);
    assert.equal(isWeirdTowerActivityOpen(at(2025, 12, 12, 12, 0)), true);
  });

  it("黑市周的其他日期全天开放", () => {
    assert.equal(isWeirdTowerActivityOpen(at(2025, 12, 13, 3)), true);
  });
});

describe("每月第四个周日（月赛助威）", () => {
  it("2026-03 的历史特判：第一个周日记为 8 号", () => {
    const d = getFourthSundayOfMonth(at(2026, 3, 1));
    assert.equal(d.getDate(), 29);
  });

  it("2026-05 的第四个周日是 24 号", () => {
    assert.equal(getFourthSundayOfMonth(at(2026, 5, 1)).getDate(), 24);
  });

  it("当天 19:55 之前开放，之后关闭", () => {
    assert.equal(isWarGuessActivityOpen(at(2026, 5, 24, 0, 0)), true);
    assert.equal(isWarGuessActivityOpen(at(2026, 5, 24, 19, 55)), true);
    assert.equal(isWarGuessActivityOpen(at(2026, 5, 24, 19, 56)), false);
    assert.equal(isWarGuessActivityOpen(at(2026, 5, 24, 20, 0)), false);
  });

  it("非第四个周日关闭，并给出下个窗口的提示", () => {
    const other = at(2026, 5, 23);
    assert.equal(isWarGuessActivityOpen(other), false);
    assert.match(getWarGuessActivityTip(other), /5月24日/);
  });

  it("已开放时提示为空串", () => {
    assert.equal(getWarGuessActivityTip(at(2026, 5, 24, 10)), "");
  });

  it("2026-03-01 的一次性特判：19:55 前也开放", () => {
    assert.equal(isWarGuessActivityOpen(at(2026, 3, 1, 10)), true);
    assert.equal(isWarGuessActivityOpen(at(2026, 3, 1, 19, 56)), false);
  });
});

describe("战力格式化", () => {
  it("0 与空值显示 0", () => {
    assert.equal(formatPower(0), "0");
    assert.equal(formatPower(undefined), "0");
  });

  it("万 / 亿 两档，保留两位小数", () => {
    assert.equal(formatPower(9999), "9999");
    assert.equal(formatPower(10000), "1.00万");
    assert.equal(formatPower(123456789), "1.23亿");
  });
});
