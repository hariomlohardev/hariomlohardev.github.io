-- Blog posts — Supabase table for dynamic CRUD via /admin/blog
-- Run in Supabase Dashboard → SQL Editor → Run
-- Safe to re-run

create extension if not exists "pgcrypto";

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null,
  date date not null,
  tags text[] not null default '{}',
  cover text,
  html text not null,
  raw text not null,
  word_count int not null default 0,
  reading_minutes int not null default 3,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at before update on public.posts
for each row execute function public.touch_updated_at();

-- RLS: public can read published posts, writes only via service_role
alter table public.posts enable row level security;
drop policy if exists "public read published posts" on public.posts;
create policy "public read published posts" on public.posts for select using (published = true);
-- No insert/update/delete policies for anon → only service_role can write (used by /api/admin/posts)

-- Index for fast blog listing
create index if not exists idx_posts_date_desc on public.posts (date desc);
create index if not exists idx_posts_slug on public.posts (slug);

-- Verify
select 'posts ready' as status;
