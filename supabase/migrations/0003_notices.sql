-- Notices to platforms: connection.revoked, account.deleted, settings.updated, and notice.test
-- from the developer portal. Each is signed with the platform's notice signing secret and
-- retried until the platform answers 2xx or 30 days pass. Holds the platform's private ID for
-- the person, never the internal ID once the person is deleted.

create table notices (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references clients (client_id),
  event            text not null check (event in ('connection.revoked', 'account.deleted', 'settings.updated', 'notice.test')),
  sub              text not null,
  person_id        uuid references people (id) on delete set null,
  at               timestamptz not null default now(),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  delivered_at     timestamptz,
  gave_up_at       timestamptz,
  last_status      integer,
  last_error       text
);

create index notices_due on notices (next_attempt_at) where delivered_at is null and gave_up_at is null;
create index notices_client on notices (client_id, at desc);

alter table notices enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on notices from %I', r);
    end if;
  end loop;
end $$;
