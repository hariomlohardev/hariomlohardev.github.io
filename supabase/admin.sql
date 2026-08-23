-- ADMIN + HOME dynamic — Supabase SQL — safe to re-run
-- Project: hariomlohardev (paste in Supabase Dashboard → SQL Editor → Run)
-- Or via MCP: mcp__plugin_supabase_supabase__execute_sql

create extension if not exists "pgcrypto";

-- site_content: single JSON store for Home (and later About, etc.)
create table if not exists public.site_content (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
drop policy if exists "public read site_content" on public.site_content;
create policy "public read site_content" on public.site_content for select using (true);
-- writes only via service_role (no anon insert/update policy)

-- admin_edits audit
create table if not exists public.admin_edits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  edited_by text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_edits enable row level security;
drop policy if exists "service can insert edits" on public.admin_edits;
create policy "service can insert edits" on public.admin_edits for insert with check (true);
drop policy if exists "service can read edits" on public.admin_edits;
create policy "service can read edits" on public.admin_edits for select using (true);

-- Seed Home from data.json if empty (replace with your actual data.json content)
-- After running, verify:
-- select * from public.site_content where key='home';
-- To update: insert into public.site_content (key, data) values ('home', '{"mission":{...}}'::jsonb) on conflict (key) do update set data=excluded.data, updated_at=now();

select 'site_content ready — now seed home' as status;
