-- Record service (M3): history imports waiting for the person's approval, and which import
-- each entry came from, so "remove what it added" can be built on it later.

create table imports (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references people (id) on delete cascade,
  client_id    text not null references clients (client_id),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  entry_count  integer not null,
  -- The entries as sent, already checked against the vocabulary. Cleared once decided.
  pending      jsonb,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  -- Import is allowed once per person per platform.
  unique (person_id, client_id)
);

alter table entries add column import_id uuid references imports (id) on delete set null;

create index entries_person_occurred on entries (person_id, occurred_at desc);
create index entries_rate on entries (person_id, client_id, created_at desc);

alter table imports enable row level security;
grant select (id, person_id, client_id, status, entry_count, created_at, decided_at) on imports to mq_person;
create policy person_reads_imports on imports for select to mq_person using (person_id = mq_current_person());

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on imports from %I', r);
    end if;
  end loop;
end $$;
