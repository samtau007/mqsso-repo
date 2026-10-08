-- Muslim Quotient entry answers. One row per completed set of five questions.
-- Uses the same Supabase project as Mohasaba, so auth.users is shared.

create table if not exists public.mq_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  list_version  text not null,                       -- e.g. 'mq-entry-v1'
  answers       jsonb not null,                      -- { "<question id>": 1..7 }
  source        jsonb,                               -- first-touch ref / utm
  created_at    timestamptz not null default now(),
  constraint answers_is_object check (jsonb_typeof(answers) = 'object')
);

create index if not exists mq_entries_user_idx on public.mq_entries (user_id, created_at desc);

alter table public.mq_entries enable row level security;

create policy "Read own entries"
  on public.mq_entries for select
  using (auth.uid() = user_id);

create policy "Insert own entries"
  on public.mq_entries for insert
  with check (auth.uid() = user_id);

-- No update or delete from the client. On account deletion, rows go with auth.users (cascade).
-- Mohasaba policy: personal data removed, anonymous answers kept. Revisit before launch:
-- replace the cascade with a job that nulls user_id into an anonymous table.
