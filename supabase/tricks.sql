-- ─────────────────────────────────────────────────────────────
-- tricks — short shareable tricks: Title + full Markdown body.
-- No cover, no description. Images live inside the markdown body
-- (uploaded to the existing `blog-images` Supabase Storage bucket).
-- Public URL: /tricks/p/<id>   ·   Admin: /admin/tricks.html
-- Run this in Supabase → SQL Editor.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.tricks (
  id              bigint generated always as identity primary key,
  title           text not null check (char_length(title) >= 1 and char_length(title) <= 200),
  raw             text not null default '',
  html            text not null default '',
  tags            text[] not null default '{}',
  published       boolean not null default true,
  word_count      int not null default 0,
  reading_minutes int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tricks_published_created on public.tricks(published, created_at desc);
create index if not exists idx_tricks_created_at on public.tricks(created_at desc);

-- shared touch trigger (already created by supabase/comments.sql — safe to re-run)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_tricks_updated_at on public.tricks;
create trigger trg_tricks_updated_at before update on public.tricks
for each row execute function public.touch_updated_at();

-- RLS: anon may read published rows only. Writes go through the
-- service_role key in /api/admin/posts?type=tricks (bypasses RLS).
alter table public.tricks enable row level security;
drop policy if exists "public read published tricks" on public.tricks;
create policy "public read published tricks" on public.tricks
  for select using (published = true);
