/**
 * 注册 supabase-shim 的 module resolve hook。
 *
 *   node --import ./backend/scripts/register-shim.mjs render-backend/server.js
 *
 * 这样 render-backend/server.js 不改一行就能连本地 Postgres。
 */
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
