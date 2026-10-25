/**
 * 盐场（Legion War）时间判定。
 *
 * 单独成文件的原因：`src/router/index.js` 的路由守卫需要它，
 * 而 `clubBattleUtils.js` 同时把整包 `xlsx`（≈700 KB）静态引了进来。
 * 守卫只要时间判定，不该顺带把 xlsx 拖进首屏 entry chunk。
 *
 * 契约：`clubBattleUtils.js` 仍然对外导出 `isNowInLegionWarTime`（re-export）。
 */
import { isSameGameValue } from "./gameValue.js";

/**
 * 判断当前时间是否是盐场时间
 */
export function isNowInLegionWarTime() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const date = today.getDate();
  const hours = today.getHours();
  const minutes = today.getMinutes();
  //用分钟好计算
  const minutesCount = hours * 60 + minutes;
  //获取本月周日的数组
  const getSundayOfMonths = (year, month) => {
    const sundayArr = [];
    for (let d = 0; d < 31; d++) {
      const temp = new Date(year, month, d);
      if (
        isSameGameValue(temp.getMonth(), month) &&
        isSameGameValue(temp.getDay(), 0)
      ) {
        sundayArr.push(d);
      }
    }
    return sundayArr;
  };

  //当前时间是20.00~21.00,周日月赛则是20.00~21.30
  //前提是周六或第四周周日 1200=20*60   1260=21*60
  if (
    isSameGameValue(dayOfWeek, 6) &&
    minutesCount >= 1195 &&
    minutesCount <= 1260
  ) {
    return true;
  }
  const sundayArr = getSundayOfMonths(today.getFullYear(), today.getMonth());
  //取第四个周末的日期
  if (
    isSameGameValue(dayOfWeek, 0) &&
    sundayArr.length >= 4 &&
    isSameGameValue(date, sundayArr[3]) &&
    minutesCount >= 1195 &&
    minutesCount <= 1290
  ) {
    return true;
  }
  return false;
}
