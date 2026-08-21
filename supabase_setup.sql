-- ============================================================
-- 测评工作台 · 云端同步 建表 + 权限 SQL
-- 在 Supabase 后台「SQL Editor」里粘贴全部内容，点击 Run 执行一次即可。
-- ============================================================

-- 1) 统一存储所有业务记录，按 user_id 隔离（一张表涵盖 客户/订单/评论/结算）
create table if not exists public.records (
  user_id   uuid        not null references auth.users(id) on delete cascade,
  store     text        not null,
  rec_id    text        not null,
  data      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, rec_id)
);

create index if not exists records_user_store_idx on public.records (user_id, store);

-- 2) 行级安全（RLS）：每个登录用户只能读/写自己的数据，互不泄露
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records for select using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.records for insert with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "records_delete_own" on public.records for delete using (auth.uid() = user_id);

-- 3) 开启实时推送：其他设备的数据改动会自动同步到本机
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.records;
