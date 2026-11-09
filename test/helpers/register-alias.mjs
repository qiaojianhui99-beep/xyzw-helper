/**
 * 注册 `@/` 别名解析器，供 `node --test` 使用。
 *
 *   node --import ./test/helpers/register-alias.mjs --test test/*.test.js
 */
import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
