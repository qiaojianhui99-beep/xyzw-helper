-- 002_token_enc.sql
-- Token 加密列：与 001 的明文 `token` 列并存（双写）。
--
-- 为什么双写而不是替换：
--   1. 前端「浏览器直连游戏服」模式仍需要明文 token，直接改列会打断现有功能；
--   2. S1/S2 的对拍基准（baseline.original.json）以明文形式固化，替换列会制造假回归；
--   3. 双写让 worker 可以先走密文，前端可以后切换，两边解耦。
--
-- 迁移到「只存密文」在 S6：届时 API 返回 token_masked，明文改由
-- POST /api/tokens/:id/reveal（鉴权 + 审计 + 限频）单次下发。

begin;

alter table tokens
  add column if not exists token_enc    jsonb,
  add column if not exists token_masked text;

comment on column tokens.token_enc is 'AES-256-GCM 信封密文 {v,kid,iv,tag,ct}；worker 解密用';
comment on column tokens.token_masked is '首尾各 4 位的展示值，供列表接口下发';

commit;
