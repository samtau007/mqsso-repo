-- Account safety: passkeys, printable recovery codes, and merging two accounts.

create table passkeys (
  id            text primary key,              -- the credential ID, base64url
  person_id     uuid not null references people (id) on delete cascade,
  public_key    bytea not null,
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  name          text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index passkeys_person on passkeys (person_id);

-- A WebAuthn challenge, or an offer to add a passkey after an email code was verified. Keyed by
-- purpose and the sign-in interaction (or the person, on the dashboard). Ten minutes.
create table webauthn_challenges (
  id          text primary key,
  challenge   text,
  person_id   uuid references people (id) on delete cascade,
  expires_at  timestamptz not null
);

create table recovery_codes (
  id          bigserial primary key,
  person_id   uuid not null references people (id) on delete cascade,
  code_hash   text not null unique,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index recovery_codes_person on recovery_codes (person_id);

alter table people add column passkey_offered_at timestamptz;

alter table login_codes drop constraint login_codes_purpose_check;
alter table login_codes add constraint login_codes_purpose_check check (purpose in ('signin', 'portal', 'merge'));

alter table passkeys enable row level security;
alter table webauthn_challenges enable row level security;
alter table recovery_codes enable row level security;

grant select (id, person_id, name, created_at, last_used_at) on passkeys to mq_person;
create policy person_reads_passkeys on passkeys for select to mq_person using (person_id = mq_current_person());
grant select (id, person_id, created_at, used_at) on recovery_codes to mq_person;
create policy person_reads_recovery on recovery_codes for select to mq_person using (person_id = mq_current_person());

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on passkeys, webauthn_challenges, recovery_codes from %I', r);
      execute format('revoke all on all sequences in schema %I from %I', current_schema(), r);
    end if;
  end loop;
end $$;
