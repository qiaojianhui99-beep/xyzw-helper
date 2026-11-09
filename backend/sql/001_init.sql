-- 001_init.sql
-- 复刻 render-backend/server.js 当前使用的三张表。
-- 目的：让「原版 Express + supabase-shim」与「新版 Fastify + pg」跑在同一份 schema 上，
--       从而可以逐字节对比响应，证明功能一致（characterization baseline）。
--
-- 列名规则：必须与 PostgREST 原样返回的列名完全一致（camelCase 用双引号），
--          否则服务端 `token.roleId` 之类的读取会变成 undefined。
--          server.js 的 tokenData 组装依赖 roleId/sessId/connId/isRestore 四个字段。

begin;

-- ---------------------------------------------------------------- tokens
create table if not exists tokens (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  token         text not null,              -- 明文；S3 会改成 token_enc 并迁移
  "roleId"      text,
  "sessId"      text,
  "connId"      text,
  "isRestore"   boolean,
  ws_url        text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists tokens_enabled_idx on tokens (enabled);
create index if not exists tokens_created_idx on tokens (created_at);

-- ------------------------------------------------------------- cron_tasks
-- server.js 同时兼容新旧两套字段名，两套都保留列，避免改写原版行为。
create table if not exists cron_tasks (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  cron_expr        text,                    -- 新字段
  cron_expression  text,                    -- 旧字段（兼容）
  selected_tokens  jsonb default '[]'::jsonb,  -- 新字段：uuid 数组
  token_ids        jsonb default '[]'::jsonb,  -- 旧字段（兼容）
  selected_tasks   jsonb default '[]'::jsonb,  -- TASK_DEFINITIONS 的 key 数组
  task_type        text,                    -- 旧字段：单个任务 key（兼容）
  enabled          boolean not null default true,
  last_run_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists cron_tasks_enabled_idx on cron_tasks (enabled);
create index if not exists cron_tasks_created_idx on cron_tasks (created_at);

-- -------------------------------------------------------------- task_logs
create table if not exists task_logs (
  id          bigserial primary key,
  task_id     uuid,
  token_name  text,
  task_type   text,
  status      text,
  message     text,
  created_at  timestamptz not null default now()
);

create index if not exists task_logs_created_idx on task_logs (created_at desc);
create index if not exists task_logs_task_idx    on task_logs (task_id);

commit;
