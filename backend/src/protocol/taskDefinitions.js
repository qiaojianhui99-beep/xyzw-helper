/**
 * 任务字典 —— 从 render-backend/server.js 的 TASK_DEFINITIONS 原样搬移。
 *
 * 这是「对外契约」的一部分：GET /api/task-definitions 会把 key/name/commands
 * 直接暴露给前端，任何改名都会让前端的任务勾选项失效。
 * 因此本文件只允许新增条目，不允许重命名或删除既有条目。
 */

export const TASK_DEFINITIONS = {
  signIn: {
    name: "签到",
    commands: [{ cmd: "system_signinreward", params: {} }],
  },
  claimHangup: {
    name: "领取挂机奖励",
    commands: [{ cmd: "system_claimhangupreward", params: {} }],
  },
  claimDaily: {
    name: "领取日常奖励",
    commands: [{ cmd: "task_claimdailyreward", params: { rewardId: 0 } }],
  },
  claimDailyPoint: {
    name: "领取每日积分",
    commands: [{ cmd: "task_claimdailypoint", params: { taskId: 1 } }],
  },
  climbTower: {
    name: "爬塔领奖励",
    commands: [
      { cmd: "tower_getinfo", params: {} },
      { cmd: "tower_claimreward", params: {} },
    ],
  },
  climbWeirdTower: {
    name: "怪异塔",
    commands: [
      { cmd: "evotower_getinfo", params: {} },
      { cmd: "evotower_claimreward", params: {} },
    ],
  },
  arenaFight: {
    name: "竞技场",
    commands: [
      { cmd: "arena_startarea", params: {} },
      { cmd: "arena_getareatarget", params: { refresh: false } },
    ],
  },
  claimMail: {
    name: "领取邮件附件",
    commands: [{ cmd: "mail_claimallattachment", params: { category: 0 } }],
  },
  legacyHangup: {
    name: "功法挂机",
    commands: [
      { cmd: "legacy_getinfo", params: {} },
      { cmd: "legacy_claimhangup", params: {} },
    ],
  },
  heroRecruit: {
    name: "武将招募",
    commands: [
      {
        cmd: "hero_recruit",
        params: { byClub: false, recruitNumber: 1, recruitType: 3 },
      },
    ],
  },
  studyGame: {
    name: "学习问答",
    commands: [{ cmd: "study_startgame", params: {} }],
  },
  genieSweep: {
    name: "灯神",
    commands: [{ cmd: "genie_sweep", params: { genieId: 1 } }],
  },
  openBox: {
    name: "开箱",
    commands: [{ cmd: "item_openbox", params: { itemId: 2001, number: 10 } }],
  },
  legionSignIn: {
    name: "军团签到",
    commands: [
      { cmd: "legion_getinfo", params: {} },
      { cmd: "legion_signin", params: {} },
    ],
  },
  bossTower: {
    name: "咸王宝库",
    commands: [
      { cmd: "bosstower_getinfo", params: {} },
      { cmd: "bosstower_startboss", params: {} },
      { cmd: "bosstower_startbox", params: {} },
    ],
  },
  mergeBox: {
    name: "合并魔盒",
    commands: [
      { cmd: "mergebox_getinfo", params: {} },
      { cmd: "mergebox_claimfreeenergy", params: {} },
      { cmd: "mergebox_openbox", params: {} },
    ],
  },
  dailyBundle: {
    name: "一键日常",
    commands: [
      { cmd: "system_signinreward", params: {} },
      { cmd: "system_claimhangupreward", params: {} },
      { cmd: "task_claimdailyreward", params: { rewardId: 0 } },
      { cmd: "tower_getinfo", params: {} },
      { cmd: "tower_claimreward", params: {} },
      { cmd: "mail_claimallattachment", params: { category: 0 } },
      { cmd: "legacy_getinfo", params: {} },
      { cmd: "legacy_claimhangup", params: {} },
    ],
  },
};

/**
 * 把一组任务 key 展开成去重后的命令列表。
 * 与原版 executeTask 内的展开逻辑等价（同 cmd + 同 params 视为重复）。
 *
 * @param {string[]} taskKeys
 * @returns {{ commands: Array<{cmd: string, params: object}>, unknownKeys: string[] }}
 */
export function expandCommands(taskKeys) {
  const commands = [];
  const unknownKeys = [];
  const seen = new Set();

  for (const key of taskKeys) {
    const def = TASK_DEFINITIONS[key];
    if (!def) {
      unknownKeys.push(key);
      continue;
    }
    for (const c of def.commands) {
      const signature = c.cmd + JSON.stringify(c.params);
      if (seen.has(signature)) continue;
      seen.add(signature);
      commands.push(c);
    }
  }

  return { commands, unknownKeys };
}

/** GET /api/task-definitions 的响应体形状（与原版一致）。 */
export function listTaskDefinitions() {
  return Object.entries(TASK_DEFINITIONS).map(([key, val]) => ({
    key,
    name: val.name,
    commands: val.commands.map((c) => c.cmd),
  }));
}
