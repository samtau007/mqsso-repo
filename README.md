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
| `muslimquotient.com` | Website and, from M2, the dashboard | `app/` |
| `api.muslimquotient.com` | Record service (from M3) | not built yet |

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

### Postgres (a new Supabase project, separate from Mohasaba)

1. Create the project. In Project Settings, Data API, turn the Data API off: nothing uses it.
2. Run `supabase/migrations/0001_muslim_quotient.sql` once, in the SQL editor or with `npm run migrate`.
3. Copy the **transaction pooler** connection string (Project Settings, Database, Connection string, port 6543) into the `DATABASE_URL` environment variable in Vercel.

### Domains (Vercel)

Add these domains to the Vercel project. Vercel shows the exact DNS record for each; usually an `A` record for the apex and a `CNAME` to `cname.vercel-dns.com` for each subdomain.

| Domain | Record |
| --- | --- |
| `muslimquotient.com` | `A` as shown by Vercel |
| `www.muslimquotient.com` | `CNAME`, redirect to the apex in Vercel |
| `id.muslimquotient.com` | `CNAME` |
| `developers.muslimquotient.com` | `CNAME` |
| `api.muslimquotient.com` | `CNAME` (used from M3) |

### Email

- Login codes: add the sending domain in Resend and create the SPF, DKIM and return-path records it shows. Turn open and click tracking off for that domain. Set `RESEND_API_KEY` and `MQ_MAIL_FROM`.
- Relay (M6): `relay.muslimquotient.com` gets an `MX` record pointing to Postmark inbound.

### Environment variables (Vercel)

Everything in `.env.example`. Generate the secrets with `npm run secrets` on your own machine and paste them straight into Vercel; they should never pass through chat or git. `MQ_PAIRWISE_SALT` and `MQ_INDEX_KEY` must never change once anyone has signed up.
