-- Relax comments.content check: remove 2000 upper bound so per-post word limits and -1 unlimited are not blocked
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
