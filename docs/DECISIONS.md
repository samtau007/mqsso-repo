# Decisions log

One line per decision, newest first. Claude Code adds a line here whenever Sami settles something, and never records a decision Sami has not made.

| Date | Decision | Who |
| --- | --- | --- |
| 2026-10-09 | Platforms send entries to Muslim Quotient; Muslim Quotient never pulls. The dashboard is live because platforms send as things happen | Sami |
| 2026-10-09 | Testing for platforms is a test mode per platform in the developer portal, not a separate sandbox environment | Sami |
| 2026-10-09 | Build order changes: make the whole platform ready (notices, dashboard, account safety, relay, developer package) before connecting istighfar.club, Mohasaba or any other app; then reach out to platforms | Sami |
| 2026-10-09 | A connection never expires on its own: no yearly reconnecting. It lasts until the person disconnects or deletes their account | Sami |
| 2026-10-09 | "Hide my email" stays offered for now | Sami |
| 2026-10-09 | The istighfar.club extension gets Sign in with Muslim Quotient; that work lives in the istighfar-club repository | Sami |
| 2026-10-08 | Staging only: Muslim Quotient staging uses its own schema (`mq`, owned by role `mq_app`) inside the mohasaba-staging Supabase project, to stay on the free plan. Production Mohasaba and production Muslim Quotient each get their own project when bought | Sami |
| 2026-10-08 | The five entry questions belong to Mohasaba only. Muslim Quotient shows no questions at all, now or later. "Create your ID" goes straight to sign-up; Reflection stays empty until Mohasaba connects in M4 | Sami |
| 2026-10-08 | The email relay runs on Postmark | Sami |
| 2026-10-08 | Mohasaba keeps "Continue with Google" for now; Sign in with Muslim Quotient is added beside it in M4; Google is removed later, once existing accounts have linked | Sami |
| 2026-10-08 | Until the guide's open items are settled, build with the guide's defaults (circle size 30, `mq.name` offered) and flag each one when reached | Sami |
| 2026-10-08 | Sign-in service is our own, built on node-oidc-provider; Supabase is used only as Postgres. Ory Hydra is the fallback | Sami |
| 2026-10-08 | Our three products integrate exactly as outside platforms do: developer portal, public guide, no shared database | Sami |
| 2026-10-07 | Pairwise private IDs per platform; our three products share one sector group | Sami |
| 2026-10-07 | Email: the person chooses per platform between real email and a relay address | Sami |
| 2026-10-07 | People are shown under a given name that changes every 30 days; no real names | Sami |
| 2026-10-07 | Dashboard is organised as Learning, Practice, Reflection; Mohasaba is a separate product that connects as a test | Sami |
| 2026-10-07 | Public positioning: "helps you grow as a Muslim" and "Your direction, across every Muslim platform" | Sami |
| 2026-10-07 | Muslim Quotient holds no content; goals open the right platform | Sami |

## Open

See the end of `PRD.md`. Nothing in the open list is settled.
