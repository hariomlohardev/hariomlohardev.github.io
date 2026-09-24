-- Comments + Ratings for blog — custom system (replaces giscus)
-- Run in Supabase Dashboard → SQL Editor → Run
-- Safe to re-run

create extension if not exists "pgcrypto";

-- ── comments (threaded replies via parent_id) ──────────────────────
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  client_id text not null,
  author_name text,
  content text not null check (char_length(content) >= 1),
  created_at timestamptz not null default now()
);

-- Relax 2000 char cap for existing tables (safe to re-run): drop any old char_length check then add new one without 2000 upper bound
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid = 'public.comments'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%char_length(content)%' loop
    execute 'alter table public.comments drop constraint ' || quote_ident(r.conname);
  end loop;
exception when undefined_table then null;
end $$;
alter table public.comments drop constraint if exists comments_content_check;
do $$ begin
  alter table public.comments add constraint comments_content_check check (char_length(content) >= 1);
exception when duplicate_object then null;
end $$;

create index if not exists idx_comments_post_slug on public.comments(post_slug);
create index if not exists idx_comments_parent_id on public.comments(parent_id);
create index if not exists idx_comments_created_at on public.comments(created_at asc);
create index if not exists idx_comments_client_id on public.comments(client_id);

-- ── ratings (one per client per post, 1..5 slider) ────────────────
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null,
  client_id text not null,
  score smallint not null check (score >= 1 and score <= 5),
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_slug, client_id)
);
create index if not exists idx_ratings_post_slug on public.ratings(post_slug);
create index if not exists idx_ratings_client_id on public.ratings(client_id);

-- keep updated_at fresh for ratings
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_ratings_updated_at on public.ratings;
create trigger trg_ratings_updated_at before update on public.ratings
for each row execute function public.touch_updated_at();

-- ── RLS: public can READ; writes only via service_role (API) ──────
alter table public.comments enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "public read comments" on public.comments;
create policy "public read comments" on public.comments for select using (true);

drop policy if exists "public read ratings" on public.ratings;
create policy "public read ratings" on public.ratings for select using (true);

-- No insert/update/delete policies for anon → only service_role (used by /api/blog/comments and /api/blog/ratings) can write.
-- If you need anon direct writes (no API), uncomment:
-- create policy "anon insert comments" on public.comments for insert with check (true);
-- create policy "anon insert ratings"  on public.ratings  for insert with check (true);
-- create policy "anon update ratings"  on public.ratings  for update using (true) with check (true);

select 'comments + ratings ready' as status;
