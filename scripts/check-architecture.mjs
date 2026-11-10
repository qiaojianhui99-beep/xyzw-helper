#!/usr/bin/env node
/**
 * 架构契约校验器（开闭原则护栏）
 *
 * 目标：以后加功能可以随便加，但**已有的东西不能被悄悄拿走或改掉**。
 *
 * 它把当前工程里「对外承诺过的形状」抽成事实快照，再和
 * `architecture.contract.json`（基线）逐条比对：
 *
 *   - 基线里有、现在没有  -> 违规（退出码 1）
 *   - 现在有、基线里没有  -> 新增，允许（--update 时并入基线）
 *   - 默认参数值变了      -> 违规
 *
 * 用法：
 *   node scripts/check-architecture.mjs                     # 只校验（新增项仅提示）
 *   node scripts/check-architecture.mjs --strict            # 新增项也算违规（CI 用这个）
 *   node scripts/check-architecture.mjs --update            # 并入新增项（拒绝删除）
 *   node scripts/check-architecture.mjs --update --allow-removals   # 显式确认删除项
 *
 * 为什么要有 --strict：默认模式只拦「删除/改名」，新增永远静默通过，
 * 于是基线会一路落后于代码（2026-11 实测落后 5 条代理前缀）。
 * CI 用 --strict，强制「新增能力必须显式固化进基线」。
 *
 * 被 `npm run check:arch`、`npm run verify` 和
 * `test/architectureContract.test.js` 复用，所以 `npm test` 也会跑它。
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, "..");
export const CONTRACT_FILE = "architecture.contract.json";

/** 关键文件：删掉/改名就会让某个功能整体消失的文件 */
const CURATED_FILES = [
  "index.html",
  "package.json",
  "vite.config.js",
  "worker.js",
  "wrangler.toml",
  "src/main.js",
  "src/App.vue",
  "src/router/index.js",
  "src/stores/tokenStore.ts",
  "src/stores/auth.js",
  "src/stores/gameRoles.js",
  "src/stores/localTokenManager.js",
  "src/stores/changelogStore.js",
  "src/stores/cache.ts",
  "src/stores/legionWarStore.js",
  "src/stores/events/index.ts",
  "src/utils/bonProtocol.js",
  "src/utils/xyzwWebSocket.js",
  "src/utils/xyzwLegionWarWebSocket.js",
  "src/utils/wsAgent.js",
  "src/utils/gameCommands.js",
  "src/utils/dailyTaskRunner.js",
  "src/utils/dailyTaskState.js",
  "src/utils/helperTaskRunner.js",
  "src/utils/tokenDb.js",
  "src/utils/gameLauncher.js",
  "src/utils/gameSelection.js",
  "src/utils/gameValue.js",
  "src/utils/logger.js",
  "src/utils/apexRules.js",
  "src/utils/apexRateLimit.js",
  "src/utils/towerClimbLimit.js",
  "src/utils/clubBattleUtils.js",
  "src/utils/imageExport.js",
  "src/utils/batch/index.js",
  "src/utils/batch/constants.js",
  "src/utils/batch/connectionManager.js",
  "src/utils/batch/tasksStore.js",
  "src/utils/batch/tasksArena.js",
  "src/utils/batch/tasksHangUp.js",
  "src/utils/batch/tasksLegacy.js",
  "src/utils/batch/tasksItem.js",
  "src/utils/batch/blackMarketConfig.js",
  "src/utils/batch/cronUtils.js",
  "src/composables/useTheme.js",
  "src/composables/usePersistentRef.ts",
  "src/api/storage.js",
  "src/api/storageSync.js",
  "backend/package.json",
  "backend/src/api/app.js",
  "backend/src/config.js",
  "backend/src/domain/tokenService.js",
  "backend/src/infra/crypto.js",
  "backend/src/worker/main.js",
  "backend/sql/001_init.sql",
  "deploy/docker-compose.stack.yml",
  "public/game/index.html",
  "public/game/multi-game.html",
  "public/game/multi-game-storage-bridge.js",
  "render-backend/server.js",
  "render-backend/package.json",
];

/** 需要冻结「导出符号」的模块：这些是功能入口，改名/删除等于破坏调用方 */
const EXPORT_MODULES = [
  "src/utils/bonProtocol.js",
  "src/utils/xyzwWebSocket.js",
  "src/utils/xyzwLegionWarWebSocket.js",
  "src/utils/gameCommands.js",
  "src/utils/dailyTaskRunner.js",
  "src/utils/dailyTaskState.js",
  "src/utils/tokenDb.js",
  "src/utils/gameValue.js",
  "src/utils/apexRules.js",
  "src/utils/towerClimbLimit.js",
  "src/utils/clubBattleUtils.js",
  "src/utils/batch/constants.js",
  "src/utils/batch/index.js",
  "src/utils/batch/connectionManager.js",
  "src/utils/batch/cronUtils.js",
  "src/stores/tokenStore.ts",
  "src/stores/cache.ts",
  "src/stores/events/index.ts",
  "src/stores/events/types.ts",
  "src/utils/cache.ts",
  "src/api/storage.js",
  "src/api/storageSync.js",
  "src/composables/usePersistentRef.ts",
];

/** 必须存在的 npm 脚本（删掉就跑不了工程） */
const REQUIRED_SCRIPTS = ["dev", "build", "preview", "test", "lint", "format"];

/** 默认参数：改这些等于悄悄改变全部用户的行为，必须显式过流程 */
const FROZEN_DEFAULTS = {
  file: "src/utils/batch/constants.js",
  keys: [
    "commandDelay",
    "taskDelay",
    "maxActive",
    "connectionTimeout",
    "reconnectDelay",
    "maxLogEntries",
    "boxCount",
    "fishCount",
    "recruitCount",
  ],
};

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "src/xyzw",
  "public/game/assets",
  "public/game/src",
  "public/box",
  "public/fish",
  "public/team",
  "public/icons",
]);

async function readText(root, rel) {
  try {
    return await readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

function extractExports(source) {
  const names = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /export\s+interface\s+([A-Za-z0-9_$]+)/g,
    /export\s+type\s+([A-Za-z0-9_$]+)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) names.add(m[1]);
  }
  // `export type { A, B } from "..."` 同样是对外承诺，旧正则只认 `export { ... }`
  for (const m of source.matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
    for (const raw of m[1].split(",")) {
      const token = raw.trim();
      if (!token) continue;
      names.add(token.split(/\s+/)[0]);
    }
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of m[1].split(",")) {
      const token = raw.trim();
      if (!token) continue;
      if (token.startsWith("type ")) continue;
      const asMatch = token.match(/\bas\s+([A-Za-z0-9_$]+)$/);
      names.add(asMatch ? asMatch[1] : token.split(/\s+/)[0]);
    }
  }
  return [...names].sort();
}

async function walk(dir, root, out = []) {
  const abs = path.join(root, dir);
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = path.posix.join(dir, entry.name);
    if (SKIP_DIRS.has(rel) || entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      await walk(rel, root, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

/** 抽取「工程对外承诺的形状」当前事实 */
export async function collectFacts(root = DEFAULT_ROOT) {
  const facts = {
    files: {},
    modules: {},
    views: [],
    batchTasks: [],
    routes: [],
    routeNames: [],
    storageKeys: [],
    proxyPrefixes: [],
    scripts: [],
    dependencies: {},
    defaults: {},
    requiresTokenRoutes: 0,
  };

  const pkgRaw = await readText(root, "package.json");
  if (pkgRaw) {
    const pkg = JSON.parse(pkgRaw);
    facts.scripts = Object.keys(pkg.scripts ?? {}).sort();
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      facts.dependencies[name] = version;
    }
  }

  const routerRaw = await readText(root, "src/router/index.js");
  if (routerRaw) {
    const paths = new Set();
    for (const m of routerRaw.matchAll(/\bpath:\s*["']([^"']+)["']/g)) paths.add(m[1]);
    facts.routes = [...paths].sort();
    const names = new Set();
    for (const m of routerRaw.matchAll(/\bname:\s*["']([^"']+)["']/g)) names.add(m[1]);
    facts.routeNames = [...names].sort();
    facts.requiresTokenRoutes = (
      routerRaw.match(/requiresToken:\s*true/g) ?? []
    ).length;
  }

  const viteRaw = await readText(root, "vite.config.js");
  if (viteRaw) {
    const prefixes = new Set();
    for (const m of viteRaw.matchAll(/^\s*["'](\/api\/[^"']+)["']\s*:\s*\{/gm)) {
      prefixes.add(m[1]);
    }
    facts.proxyPrefixes = [...prefixes].sort();
  }

  const allFiles = await walk("src", root, []);
  facts.views = allFiles
    .filter((f) => f.startsWith("src/views/") && f.endsWith(".vue"))
    .sort();
  facts.batchTasks = allFiles
    .filter((f) => /^src\/utils\/batch\/tasks.*\.js$/.test(f))
    .sort();

  const storageKeys = new Set();
  // 四条通道都要扫：VueUse（历史）、直调 localStorage（历史）、facade、usePersistentRef。
  // 少扫一条，切换到新通道时契约会误报「存储键丢失」。
  const STORAGE_RE =
    /(?:useLocalStorage\s*(?:<[^>]*>)?\(\s*|usePersistentRef\s*(?:<[^>]*>)?\(\s*|localStorage\.(?:getItem|setItem|removeItem)\(\s*|storage\.(?:getItem|setItem|removeItem)\(\s*)["']([^"']+)["']/g;
  for (const file of allFiles) {
    if (!/\.(js|ts|vue)$/.test(file)) continue;
    const src = await readText(root, file);
    if (!src) continue;
    for (const m of src.matchAll(STORAGE_RE)) storageKeys.add(m[1]);
  }
  facts.storageKeys = [...storageKeys].sort();

  for (const file of CURATED_FILES) {
    facts.files[file] = (await readText(root, file)) !== null;
  }

  for (const file of EXPORT_MODULES) {
    const src = await readText(root, file);
    facts.modules[file] = src ? extractExports(src) : null;
  }

  const defaultsRaw = await readText(root, FROZEN_DEFAULTS.file);
  if (defaultsRaw) {
    for (const key of FROZEN_DEFAULTS.keys) {
      const m = defaultsRaw.match(
        new RegExp(`\\b${key}:\\s*(-?\\d+(?:\\.\\d+)?)`),
      );
      if (m) facts.defaults[key] = Number(m[1]);
    }
  }

  return facts;
}

/** 工程自身的硬性要求（不依赖基线文件），任何开发机上都应成立 */
export function checkRequiredScripts(facts) {
  return REQUIRED_SCRIPTS.filter((script) => !facts.scripts.includes(script)).map(
    (script) => `npm 脚本缺失：${script}`,
  );
}

/** 单向比对：基线是承诺，只允许加，不允许减 */
export function compare(contract, facts) {
  const violations = [];
  const additions = [];

  const contractFiles = Array.isArray(contract.files)
    ? contract.files
    : Object.keys(contract.files ?? {}).filter((file) => contract.files[file]);

  for (const file of contractFiles) {
    if (!facts.files[file]) violations.push(`关键文件缺失：${file}`);
  }

  for (const [file, expected] of Object.entries(contract.modules ?? {})) {
    const actual = facts.modules[file];
    if (actual === null || actual === undefined) {
      violations.push(`契约模块缺失：${file}`);
      continue;
    }
    const actualSet = new Set(actual);
    for (const name of expected) {
      if (!actualSet.has(name)) violations.push(`导出被删除：${file} -> ${name}`);
    }
    for (const name of actual) {
      if (!expected.includes(name))
        additions.push(`新导出：${file} -> ${name}`);
    }
  }

  const compareList = (label, expected, actual) => {
    const actualSet = new Set(actual);
    for (const item of expected) {
      if (!actualSet.has(item)) violations.push(`${label}丢失：${item}`);
    }
    for (const item of actual) {
      if (!expected.includes(item)) additions.push(`${label}新增：${item}`);
    }
  };

  compareList("路由 path", contract.routes ?? [], facts.routes);
  compareList("路由 name", contract.routeNames ?? [], facts.routeNames);
  compareList("vue 页面", contract.views ?? [], facts.views);
  compareList("批量任务模块", contract.batchTasks ?? [], facts.batchTasks);
  compareList("localStorage 键", contract.storageKeys ?? [], facts.storageKeys);
  compareList("代理前缀", contract.proxyPrefixes ?? [], facts.proxyPrefixes);

  // 脚本与依赖也走双向比对：新增同样是「契约面变化」，--strict 下必须显式固化
  compareList("npm 脚本", contract.scripts ?? [], facts.scripts);
  compareList(
    "依赖",
    Object.keys(contract.dependencies ?? {}),
    Object.keys(facts.dependencies),
  );
  for (const [name, version] of Object.entries(contract.dependencies ?? {})) {
    if (!(name in facts.dependencies)) {
      violations.push(`依赖被移除：${name}@${version}`);
    }
  }

  for (const [key, value] of Object.entries(contract.defaults ?? {})) {
    if (facts.defaults[key] !== value) {
      violations.push(
        `默认参数被改动：${key} 期望 ${value}，实际 ${String(facts.defaults[key])}`,
      );
    }
  }

  if (
    typeof contract.requiresTokenRoutes === "number" &&
    facts.requiresTokenRoutes < contract.requiresTokenRoutes
  ) {
    violations.push(
      `受保护路由变少：requiresToken:true 期望 >= ${contract.requiresTokenRoutes}，实际 ${facts.requiresTokenRoutes}`,
    );
  }

  return { violations, additions };
}

function renderContract(contract, facts) {
  const merged = {
    $comment:
      "架构契约基线：只允许新增，不允许删除。改动前请读 docs/OPEN-CLOSED-RULES.md。由 scripts/check-architecture.mjs --update 维护。",
    version: contract.version ?? 1,
    files: Array.from(
      new Set([...(contract.files ?? []), ...Object.keys(facts.files).filter((f) => facts.files[f])]),
    ).sort(),
    modules: {},
    views: Array.from(new Set([...(contract.views ?? []), ...facts.views])).sort(),
    batchTasks: Array.from(
      new Set([...(contract.batchTasks ?? []), ...facts.batchTasks]),
    ).sort(),
    routes: Array.from(new Set([...(contract.routes ?? []), ...facts.routes])).sort(),
    routeNames: Array.from(
      new Set([...(contract.routeNames ?? []), ...facts.routeNames]),
    ).sort(),
    storageKeys: Array.from(
      new Set([...(contract.storageKeys ?? []), ...facts.storageKeys]),
    ).sort(),
    proxyPrefixes: Array.from(
      new Set([...(contract.proxyPrefixes ?? []), ...facts.proxyPrefixes]),
    ).sort(),
    scripts: Array.from(new Set([...(contract.scripts ?? []), ...facts.scripts])).sort(),
    dependencies: { ...(contract.dependencies ?? {}), ...facts.dependencies },
    defaults: { ...(contract.defaults ?? {}), ...facts.defaults },
    requiresTokenRoutes: Math.max(
      contract.requiresTokenRoutes ?? 0,
      facts.requiresTokenRoutes,
    ),
  };

  for (const file of Object.keys(facts.modules)) {
    const previous = contract.modules?.[file] ?? [];
    const current = facts.modules[file] ?? [];
    merged.modules[file] = Array.from(new Set([...previous, ...current])).sort();
  }

  return merged;
}

export async function checkArchitecture(options = {}) {
  const {
    root = DEFAULT_ROOT,
    update = false,
    allowRemovals = false,
    strict = false,
  } = options;

  const contractPath = path.join(root, CONTRACT_FILE);
  let contract = {};
  try {
    contract = JSON.parse(await readFile(contractPath, "utf8"));
  } catch {
    contract = {};
  }

  const facts = await collectFacts(root);
  const { violations, additions } = compare(contract, facts);
  violations.unshift(...checkRequiredScripts(facts));

  if (update) {
    // 更新模式：只允许加，删掉的条目除非显式 --allow-removals，否则拒绝写回
    if (violations.length > 0 && !allowRemovals) {
      return { ok: false, violations, additions, updated: false, facts, contract };
    }
    const next = renderContract(contract, facts);
    if (allowRemovals) {
      // 显式确认删除后，用当前事实重建列表
      for (const key of [
        "views",
        "batchTasks",
        "routes",
        "routeNames",
        "storageKeys",
        "proxyPrefixes",
        "scripts",
      ]) {
        next[key] = [...new Set(facts[key])].sort();
      }
      next.files = Object.keys(facts.files)
        .filter((f) => facts.files[f])
        .sort();
      next.dependencies = { ...facts.dependencies };
      next.defaults = { ...facts.defaults };
      next.requiresTokenRoutes = facts.requiresTokenRoutes;
      for (const file of Object.keys(facts.modules)) {
        next.modules[file] = [...(facts.modules[file] ?? [])].sort();
      }
    }
    await writeFile(contractPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return {
      ok: true,
      violations: [],
      additions,
      updated: true,
      facts,
      contract: next,
    };
  }

  // --strict：新增能力也必须先进基线，否则基线迟早落后于代码
  const blocking = strict ? [...violations, ...additions.map((a) => `未固化进基线：${a}`)] : violations;
  return { ok: blocking.length === 0, violations: blocking, additions, updated: false, facts, contract };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const update = process.argv.includes("--update");
  const allowRemovals = process.argv.includes("--allow-removals");
  const strict = process.argv.includes("--strict");
  const result = await checkArchitecture({ update, allowRemovals, strict });

  if (result.updated) {
    console.log("✅ 契约基线已更新：architecture.contract.json");
    if (result.additions.length) {
      console.log(`   并入 ${result.additions.length} 项新增（允许）：`);
      for (const item of result.additions) console.log(`   + ${item}`);
    }
    process.exit(0);
  }

  if (!result.ok) {
    console.error("❌ 架构契约校验未通过 —— 有既有能力被删除/改变，或有新增未固化：\n");
    for (const item of result.violations) console.error(`   - ${item}`);
    console.error(
      "\n如果这是有意的破坏性变更，请：\n" +
        "  1) 在 docs/OPEN-CLOSED-RULES.md 记录变更原因；\n" +
        "  2) 先补/改测试，再跑 `node scripts/check-architecture.mjs --update --allow-removals`；\n" +
        "  3) 跑 `npm run verify` 确认全绿。",
    );
    console.error(
      "\n新增项若属有意扩展，跑 `node scripts/check-architecture.mjs --update` 固化即可。",
    );
    process.exit(1);
  }

  console.log(
    `✅ 架构契约校验通过：${result.facts.routes.length} 条路由 / ${result.facts.views.length} 个页面 / ${result.facts.storageKeys.length} 个存储键 / ${result.facts.batchTasks.length} 个批量任务模块`,
  );
  if (result.additions.length) {
    console.log(`   ℹ️ 检测到 ${result.additions.length} 项新增（允许，未入基线）：`);
    for (const item of result.additions) console.log(`   + ${item}`);
    console.log("   需要固化请运行：node scripts/check-architecture.mjs --update");
  }
  process.exit(0);
}
