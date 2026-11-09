-- 003_storage.sql
-- 通用键值同步表：承接前端 storage facade 推上来的 localStorage 键值。
--
-- 设计取舍：
--   - value 用 text 而不是 jsonb：前端 localStorage 里存的本来就是字符串
--     （JSON.stringify 之后），保持 text 可以零转换原样往返，避免 double-encode。
--   - 单用户阶段（S6 之前）用 key 做主键；引入 users 表后改成 (user_id, key)。

begin;

create table if not exists user_storage (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

comment on table user_storage is '前端 localStorage 的云端镜像；value 为 null 表示已删除';

commit;
