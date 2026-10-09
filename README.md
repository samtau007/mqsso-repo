# muslimquotient

One private ID and one picture across Muslim platforms.

- `docs/PRD.md`: the product and build plan. Start here.
- `docs/DEVELOPER_GUIDE.md`: what any platform (ours included) follows to connect. Served at `developers.muslimquotient.com/guide`.
- `docs/DECISIONS.md`: what has been settled, and by whom.
- `CLAUDE.md`: working rules for Claude Code.

## How this repository is laid out

One Next.js deployment answers for several hosts. `middleware.ts` routes by host.

| Host | What | Code |
| --- | --- | --- |
| `id.muslimquotient.com` | Sign-in service: node-oidc-provider, email code, permission screen, given names | `pages/api/id`, `lib/oidc` |
| `developers.muslimquotient.com` | Developer portal: register a platform, keys, approval | `app/developers` |
| `www.muslimquotient.com` | Website and dashboard; signs in through `id.` as an ordinary platform | `app/`, `lib/site` |
| `api.muslimquotient.com` | Record service: `/v1/record`, `/v1/record/import`, `/v1/settings` | `app/api/v1`, `lib/record.ts`, `lib/vocabulary.ts` |

Postgres holds everything (`supabase/migrations`). Supabase is used only as the database: no Supabase Auth, no Data API.

## Develop

```bash
npm install
cp .env.example .env.local
npm run secrets            # paste the output into .env.local
npm run migrate            # needs DATABASE_URL
npm run dev
```

Open `http://developers.localhost:3000`. Login codes are printed in the server log when `RESEND_API_KEY` is empty. Put your own email in `MQ_PORTAL_ADMINS` to approve platforms.

## Test

```bash
npm run test               # unit tests
npm run build
TEST_DATABASE_URL=postgres://user:pass@127.0.0.1/mq_test npm run test:e2e
```

The end-to-end test wipes the database in `TEST_DATABASE_URL`, starts the built app, and drives a browser (Chromium; set `CHROMIUM_PATH` if it is not at the default path). A test platform registers in the portal, is approved, and signs a person in with a standard OpenID Connect library, exactly as the developer guide describes.

## Setting up an environment

### Postgres

**Staging** shares the mohasaba-staging Supabase project (Mumbai) but lives in its own schema, `mq`, owned by its own role, `mq_app`. `mq_app` cannot read Mohasaba's tables, and the Data API cannot see `mq`. Mohasaba's owner role can still read `mq`; that is accepted for staging only. Set up with `supabase/shared-staging/setup.sql` and the migrations, already applied on 8 October 2026.

To connect the deployment:

1. In the mohasaba-staging SQL editor, give `mq_app` a password (a long random one, kept only in Vercel):
   `alter role mq_app with password '...';`
2. In Supabase, Connect, copy the **Transaction pooler** string (port 6543). Change the user from `postgres.<project ref>` to `mq_app.<project ref>` and put in the password from step 1.
3. Set that as `DATABASE_URL` in the Vercel project `mqsso-repo`.

**Production** gets its own Supabase project. Run `npm run migrate` against it once, and set `DATABASE_URL` the same way (there the default `postgres` user is fine).

### The website as a platform

muslimquotient.com uses Muslim Quotient sign-in exactly as any platform would. In the developer portal, register it with the redirect address `https://www.muslimquotient.com/auth/mq/callback`, approve it, and set its sector group to `muslimquotient` before anyone signs in (istighfar.club and Mohasaba join the same group). Put its client ID and secret in `MQ_SITE_CLIENT_ID` and `MQ_SITE_CLIENT_SECRET`, and set `MQ_SITE_ORIGIN=https://www.muslimquotient.com`.

### Domains (Vercel)

Add these domains to the Vercel project. Vercel shows the exact DNS record for each; usually an `A` record for the apex and a `CNAME` to `cname.vercel-dns.com` for each subdomain.

| Domain | Record |
| --- | --- |
| `muslimquotient.com` | Added; redirects to `www` |
| `www.muslimquotient.com` | Added |
| `id.muslimquotient.com` | `CNAME` |
| `developers.muslimquotient.com` | `CNAME` |
| `api.muslimquotient.com` | `CNAME` |

### Email

- Login codes: add the sending domain in Resend and create the SPF, DKIM and return-path records it shows. Turn open and click tracking off for that domain. Set `RESEND_API_KEY` and `MQ_MAIL_FROM`.
- Relay (M6): `relay.muslimquotient.com` gets an `MX` record pointing to Postmark inbound.

### Environment variables (Vercel)

Everything in `.env.example`. Generate the secrets with `npm run secrets` on your own machine and paste them straight into Vercel; they should never pass through chat or git. `MQ_PAIRWISE_SALT` and `MQ_INDEX_KEY` must never change once anyone has signed up.
