# Decisions log

One line per decision, newest first. Claude Code adds a line here whenever Sami settles something, and never records a decision Sami has not made.

| Date | Decision | Who |
| --- | --- | --- |
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
