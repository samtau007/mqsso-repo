-- Muslim Quotient database, version 1. Follows the data model in docs/PRD.md section 8.
-- Supabase is used only as Postgres. The app connects with the role that owns these tables;
-- nothing here is reachable through the Supabase Data API (anon, authenticated).
-- Everything is created in the current schema: public in a project of our own, or mq in the
-- shared staging project (see supabase/shared-staging/setup.sql).

-- People and identity -------------------------------------------------------

create table people (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  given_name       text not null,
  name_changes_on  timestamptz not null
);
create index people_name_changes_on_idx on people (name_changes_on);

-- Email lives only here, encrypted. email_index is a keyed hash used to find a person by
-- email without decrypting every row. Readable only by the sign-in and relay services.
create table email_vault (
  person_id         uuid primary key references people (id) on delete cascade,
  email_ciphertext  text not null,
  email_index       text not null unique,
  updated_at        timestamptz not null default now()
);

create table given_names (
  id          bigserial primary key,
  person_id   uuid not null references people (id) on delete cascade,
  name        text not null,
  valid_from  timestamptz not null default now(),
  valid_to    timestamptz
);
create index given_names_person_idx on given_names (person_id, valid_from desc);

-- Platforms -----------------------------------------------------------------

create table developer_accounts (
  id                uuid primary key default gen_random_uuid(),
  email_ciphertext  text not null,
  email_index       text not null unique,
  created_at        timestamptz not null default now()
);

create table clients (
  client_id           text primary key,
  name                text not null,
  website             text not null,
  description         text not null,
  redirect_uris       text[] not null,
  allowed_scopes      text[] not null,
  notice_uri          text,
  client_type         text not null check (client_type in ('server', 'public')),
  client_secret_enc   text,
  signing_secret_enc  text,
  sector_group        text not null,
  sends_from          text not null check (sends_from in ('server', 'devices', 'both')),
  approved            boolean not null default false,
  owner_id            uuid not null references developer_accounts (id),
  created_at          timestamptz not null default now(),
  secret_rotated_at   timestamptz,
  check (client_type = 'public' or client_secret_enc is not null)
);
create index clients_owner_idx on clients (owner_id);

create table connections (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references people (id) on delete cascade,
  client_id      text not null references clients (client_id),
  sub            text not null,
  scopes         text[] not null,
  email_choice   text check (email_choice in ('share', 'hide')),
  relay_address  text unique,
  connected_at   timestamptz not null default now(),
  revoked_at     timestamptz,
  unique (person_id, client_id)
);
create index connections_sub_idx on connections (client_id, sub);

-- Record ----------------------------------------------------------------------

create table entries (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null references people (id) on delete cascade,
  client_id           text not null references clients (client_id),
  type                text not null check (type in ('learning', 'practice', 'reflection')),
  action              text not null,
  title               text not null,
  progress_done       integer,
  progress_of         integer,
  unit                text check (unit in ('page', 'verse', 'hadith', 'minute')),
  amount              numeric,
  range_low           numeric,
  range_high          numeric,
  range_of            numeric,
  occurred_at         timestamptz not null,
  tz                  text not null,
  vocabulary_version  integer not null,
  key                 text not null,
  source              text not null check (source in ('server', 'device')),
  created_at          timestamptz not null default now(),
  unique (client_id, key),
  check (type <> 'reflection' or (range_low is not null and range_high is not null and range_of is not null))
);
create index entries_person_idx on entries (person_id, occurred_at desc);

create table goals (
  id                 uuid primary key default gen_random_uuid(),
  person_id          uuid not null references people (id) on delete cascade,
  title              text not null,
  target_hijri       text,
  continue_in        text references clients (client_id),
  status             text not null default 'active' check (status in ('active', 'done', 'set_aside')),
  created_at         timestamptz not null default now()
);
create index goals_person_idx on goals (person_id);

create table settings (
  person_id         uuid primary key references people (id) on delete cascade,
  prayer_city       text,
  prayer_lat        numeric(6, 3),
  prayer_lng        numeric(6, 3),
  prayer_method     text,
  asr_method        text,
  hijri_adjust      integer not null default 0,
  language          text,
  tz                text,
  updated_at        timestamptz not null default now()
);

-- Security --------------------------------------------------------------------

-- Who did what and when. No content, no email.
create table audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      text not null,
  action     text not null,
  person_id  uuid,
  client_id  text,
  detail     jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on audit_log (at desc);

-- One-time sign-in codes, for people (signin) and for developer portal accounts (portal).
create table login_codes (
  id                bigserial primary key,
  purpose           text not null check (purpose in ('signin', 'portal')),
  email_index       text not null,
  email_ciphertext  text not null,
  code_hash         text not null,
  flow_id           text not null,
  attempts          integer not null default 0,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  used_at           timestamptz
);
create index login_codes_email_idx on login_codes (email_index, created_at desc);
create index login_codes_flow_idx on login_codes (flow_id, created_at desc);

-- Storage for node-oidc-provider: sessions, interactions, codes, tokens and grants.
create table oidc_payloads (
  id           text not null,
  type         text not null,
  payload      jsonb not null,
  grant_id     text,
  user_code    text,
  uid          text,
  expires_at   timestamptz,
  consumed_at  timestamptz,
  primary key (id, type)
);
create index oidc_payloads_grant_idx on oidc_payloads (grant_id);
create index oidc_payloads_uid_idx on oidc_payloads (uid);
create index oidc_payloads_expires_idx on oidc_payloads (expires_at);

-- Row-level security ------------------------------------------------------------
-- Every table has RLS on. With no policy, a role that is not the owner reads nothing.
-- mq_person: used by the dashboard inside a transaction, with mq.person_id set; reads only
--   that person's own rows.
-- mq_record: used by the record service; may only add entries.
-- Clients (platforms) never connect to the database at all.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mq_person') then create role mq_person nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'mq_record') then create role mq_record nologin; end if;
  if not pg_has_role(current_user, 'mq_person', 'member') then grant mq_person to current_user; end if;
  if not pg_has_role(current_user, 'mq_record', 'member') then grant mq_record to current_user; end if;
  execute format('grant usage on schema %I to mq_person, mq_record', current_schema());
end $$;

alter table people              enable row level security;
alter table email_vault         enable row level security;
alter table given_names         enable row level security;
alter table developer_accounts  enable row level security;
alter table clients             enable row level security;
alter table connections         enable row level security;
alter table entries             enable row level security;
alter table goals               enable row level security;
alter table settings            enable row level security;
alter table audit_log           enable row level security;
alter table login_codes         enable row level security;
alter table oidc_payloads       enable row level security;

create function mq_current_person() returns uuid
  language sql stable
  as $$ select nullif(current_setting('mq.person_id', true), '')::uuid $$;

grant select on people, given_names, connections, entries, goals, settings to mq_person;
grant select (client_id, name, website) on clients to mq_person;

create policy person_reads_self      on people      for select to mq_person using (id = mq_current_person());
create policy person_reads_names     on given_names for select to mq_person using (person_id = mq_current_person());
create policy person_reads_conns     on connections for select to mq_person using (person_id = mq_current_person());
create policy person_reads_entries   on entries     for select to mq_person using (person_id = mq_current_person());
create policy person_reads_goals     on goals       for select to mq_person using (person_id = mq_current_person());
create policy person_reads_settings  on settings    for select to mq_person using (person_id = mq_current_person());
create policy person_reads_clients   on clients     for select to mq_person using (approved);

grant insert on entries to mq_record;
create policy record_adds_entries on entries for insert to mq_record with check (true);

-- Keep the Supabase Data API out entirely.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema %I from %I', current_schema(), r);
      execute format('revoke all on all sequences in schema %I from %I', current_schema(), r);
      execute format('revoke all on all functions in schema %I from %I', current_schema(), r);
    end if;
  end loop;
end $$;
