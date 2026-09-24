alter table public.posts add column if not exists max_comment_words integer not null default 2000;
-- allow -1 for unlimited, otherwise >=1
do $$ begin
  alter table public.posts add constraint chk_posts_max_comment_words check (max_comment_words = -1 or max_comment_words >= 1);
exception when duplicate_object then null;
end $$;
