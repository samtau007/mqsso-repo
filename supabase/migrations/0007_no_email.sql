-- Joining with no email (decided 9 October 2026): a person can make their ID with a passkey
-- alone, with recovery codes as the way back. Mail that platforms send to such a person's relay
-- address waits in a private inbox on their dashboard instead of being forwarded: encrypted,
-- text only, deleted after 30 days.

-- The new person's ID, chosen before the passkey exists (the passkey carries it).
alter table webauthn_challenges add column new_person_id uuid;

create table inbox_messages (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people (id) on delete cascade,
  client_id     text references clients (client_id) on delete set null,
  sealed        text not null,              -- from, subject and text, encrypted together
  received_at   timestamptz not null default now(),
  read_at       timestamptz,
  expires_at    timestamptz not null default now() + interval '30 days'
);
create index inbox_person on inbox_messages (person_id, received_at desc);
create index inbox_expiry on inbox_messages (expires_at);

alter table inbox_messages enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on inbox_messages from %I', r);
    end if;
  end loop;
end $$;
