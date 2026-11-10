/**
 * 活动开放时间窗口。
 *
 * 这些规则原先以 computed 形式内联在 `views/BatchDailyTasks.vue` 里（约 100 行），
 * 只依赖当前时间与几个固定常量，属于纯计算 —— 抽出来后可以单测，
 * 也让那个 6000 行的组件少一块。
 *
 * 所有函数都接受 `now` 参数，便于测试固定时间点。
 */

/** 黑市周起始时间（三周一轮：黑市 → 招募 → 宝箱） */
const ACTIVITY_CYCLE_START = "2025-12-12T12:00:00";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 当前处于三周期中的哪一周。
 * @param now 参考时间
 * @returns 周名；活动开始前返回 null
 */
export function getCurrentActivityWeek(now = new Date()) {
  const elapsed = now.getTime() - new Date(ACTIVITY_CYCLE_START).getTime();
  if (elapsed < 0) return null;

  const cyclePosition = elapsed % (3 * WEEK_MS);
  if (cyclePosition < WEEK_MS) return "黑市周";
  if (cyclePosition < 2 * WEEK_MS) return "招募周";
  return "宝箱周";
}

/**
 * 梦境活动：周日 / 周一 / 周三 / 周四开放。
 * @param now 参考时间
 * @returns 是否开放
 */
export function isMengjingActivityOpen(now = new Date()) {
  const day = now.getDay();
  return day === 0 || day === 1 || day === 3 || day === 4;
}

/**
 * 宝库活动：周一、周二不开放。
 * @param now 参考时间
 * @returns 是否开放
 */
export function isBaokuActivityOpen(now = new Date()) {
  const day = now.getDay();
  return day !== 1 && day !== 2;
}

/**
 * 竞技场：每日 06:00–22:00。
 * @param now 参考时间
 * @returns 是否开放
 */
export function isArenaActivityOpen(now = new Date()) {
  const hour = now.getHours();
  return hour >= 6 && hour < 22;
}

/**
 * 怪异咸将塔：仅黑市周开放；周五需 12:00 之后。
 * @param now 参考时间
 * @returns 是否开放
 */
export function isWeirdTowerActivityOpen(now = new Date()) {
  if (getCurrentActivityWeek(now) !== "黑市周") return false;
  const day = now.getDay();
  if (day === 5) return now.getHours() >= 12;
  return true;
}

/**
 * 当月第四个周日。
 * @param now 参考时间
 * @returns 第四个周日的日期对象
 */
export function getFourthSundayOfMonth(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay(); // 0-6

  // 第一个周日：1 号是周日则为 1，否则为 1 + (7 - dayOfWeek) % 7
  let firstSundayDate = 1 + ((7 - dayOfWeek) % 7);

  // 2026 年 3 月的既有特判（线上行为，勿改）
  if (year === 2026 && month === 2 && dayOfWeek === 0) {
    firstSundayDate = 8;
  }

  return new Date(year, month, firstSundayDate + 21);
}

/**
 * 月赛助威：每月第四个周日 00:00–19:55 开放（2026-03-01 有一次性特判）。
 * @param now 参考时间
 * @returns 是否开放
 */
export function isWarGuessActivityOpen(now = new Date()) {
  if (
    now.getFullYear() === 2026 &&
    now.getMonth() === 2 &&
    now.getDate() === 1
  ) {
    const hour = now.getHours();
    const minute = now.getMinutes();
    if (hour < 19 || (hour === 19 && minute <= 55)) return true;
  }

  const fourthSunday = getFourthSundayOfMonth(now);
  if (now.getDate() !== fourthSunday.getDate()) return false;

  const hour = now.getHours();
  const minute = now.getMinutes();
  if (hour > 19 || (hour === 19 && minute > 55)) return false;
  return true;
}

/**
 * 未开放时给用户看的提示文案。
 * @param now 参考时间
 * @returns 提示语；已开放时为空串
 */
export function getWarGuessActivityTip(now = new Date()) {
  if (isWarGuessActivityOpen(now)) return "";
  const fourthSunday = getFourthSundayOfMonth(now);
  const month = fourthSunday.getMonth() + 1;
  const date = fourthSunday.getDate();
  return `月赛助威仅在每月第四个周日 (${month}月${date}日) 00:00-19:55 开放`;
}

/**
 * 战力展示：超过 1 亿用「亿」，超过 1 万用「万」，保留两位小数。
 * @param power 战力数值
 * @returns 展示字符串
 */
export function formatPower(power) {
  if (!power) return "0";
  if (power >= 100000000) return `${(power / 100000000).toFixed(2)}亿`;
  if (power >= 10000) return `${(power / 10000).toFixed(2)}万`;
  return power.toString();
}
