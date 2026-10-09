-- Test mode (decided 9 October 2026): a platform that is not approved yet is in test mode. Only
-- the testers its developer lists can sign in, what it sends is marked as test, and approval
-- clears every test sign-in and entry, so nothing from testing reaches a real record.

create table platform_testers (
  client_id    text not null references clients (client_id) on delete cascade,
  email_index  text not null,
  email_enc    text not null,
  added_at     timestamptz not null default now(),
  primary key (client_id, email_index)
);

alter table entries add column test boolean not null default false;
alter table clients add column review_requested_at timestamptz;

alter table platform_testers enable row level security;

-- People see the names of platforms they are testing too, not only approved ones. Which platforms
-- a person sees is decided by their own connections in every dashboard query.
grant select (approved) on clients to mq_person;
drop policy person_reads_clients on clients;
create policy person_reads_clients on clients for select to mq_person using (true);

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on platform_testers from %I', r);
    end if;
  end loop;
end $$;
