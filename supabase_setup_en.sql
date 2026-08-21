-- ============================================================
-- RA Review Workbench - Cloud Sync Setup
-- Paste ALL of this into Supabase SQL Editor -> New query -> Run ONCE
-- ============================================================

-- 1) Unified table for all business records, isolated by user_id
create table if not exists public.records (
  user_id    uuid         not null references auth.users(id) on delete cascade,
  store      text         not null,
  rec_id     text         not null,
  data       jsonb        not null,
  updated_at timestamptz   not null default now(),
  primary key (user_id, store, rec_id)
);

create index if not exists records_user_store_idx on public.records (user_id, store);

-- 2) Row Level Security: each logged-in user can only read/write their own data
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records for select using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records for insert with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records for delete using (auth.uid() = user_id);

-- 3) Enable realtime push so other devices' changes sync automatically
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.records;
