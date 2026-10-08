-- STAGING ONLY. Muslim Quotient staging lives in its own schema, mq, inside the
-- mohasaba-staging Supabase project (decision of 8 October 2026). Production gets its own
-- project. Run once as the postgres role, then apply supabase/migrations as mq_app.
--
-- mq_app owns everything in mq and has no rights on Mohasaba's tables in public.
-- Its search_path is mq, so the app's queries need no schema prefix.
-- Mohasaba's owner role can still read mq; that is the accepted cost of sharing staging.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mq_app') then create role mq_app login; end if;
  if not exists (select 1 from pg_roles where rolname = 'mq_person') then create role mq_person nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'mq_record') then create role mq_record nologin; end if;
end $$;

-- postgres may act as mq_app, to run migrations as the owner.
grant mq_app to postgres;
grant mq_person, mq_record to mq_app;

create schema if not exists mq authorization mq_app;
alter role mq_app set search_path = mq;

-- The Data API never sees this schema: it is not in the exposed list, and anon and
-- authenticated get nothing in it.
revoke all on schema mq from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema mq from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema mq from authenticated'; end if;
end $$;

-- Then run the migrations as mq_app: npm run migrate with DATABASE_URL set to the mq_app
-- connection (see README). Applied to mohasaba-staging on 8 October 2026.
