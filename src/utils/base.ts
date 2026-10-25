/** 取某个时间点所属「周一 00:00」的时间戳（周一为一周起点） */
const mondayStartOf = (input: number | Date) => {
  const date = new Date(input);
  const offset = (date.getDay() + 6) % 7; // 周日=0 → 6，周一=1 → 0
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return date.getTime();
};

/**
 * 判断时间戳是否落在当前这一周内（周一 00:00 重置）。
 * 与原本 moment 实现的语义一致，只是不再为这一个函数引入 moment。
 */
export const isInCurrentWeek = (timestamp: number) => {
  const now = Date.now();
  return mondayStartOf(timestamp) === mondayStartOf(now);
};

/** 生成 [min,max] 的随机整数 */
export const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** Promise 版 sleep */
export { sleep } from "./helperTaskRunner.js";
