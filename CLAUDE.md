# Muslim Quotient

Read `docs/PRD.md` and `docs/DEVELOPER_GUIDE.md` before writing any code. They are the brief.

## What this is

Muslim Quotient is one private ID and one picture across Muslim platforms. A person signs in once with Muslim Quotient on the Qur'an, hadith and learning platforms they already use, sets where they are heading, and sees their learning, practice and reflection in one private place. Muslim Quotient holds no content and teaches nothing; the work happens on the connected platforms.

Phase 1 connects only our own three products: muslimquotient.com, istighfar.club and Mohasaba. They connect exactly as any outside platform would, through the developer portal and the public developer guide, with no shortcuts and no shared database.

## Repositories

| Repo | Holds | Stack |
| --- | --- | --- |
| this one, `muslimquotient` | sign-in service (`id.`), record service (`api.`), dashboard (`muslimquotient.com`), developer portal (`developers.`), relay email | Next.js 14 (App Router), TypeScript, node-oidc-provider, Postgres (Supabase used only as the database), Vercel |
| `istighfar-club` | web + Chrome extension, becomes a client of Muslim Quotient | existing stack |
| `mohasaba` | Mohasaba, becomes a client of Muslim Quotient | Next.js, Supabase |

## Working rules

- Work one milestone at a time, in the order in `docs/PRD.md` under Build order. Stop at the end of each milestone and summarise what was built and what was assumed.
- Ask Sami before deciding anything not written in the PRD. Do not write undecided things as settled. The open decisions are listed at the end of the PRD.
- Our own products use only what `docs/DEVELOPER_GUIDE.md` says. If something is missing or unclear while integrating istighfar.club or Mohasaba, fix the guide or the service, never the product with a private shortcut.
- Spelling is Mohasaba with an o.
- Never use these words anywhere: streak, tracker, gamified, leaderboard, app (in public copy), cohort, certification, certified, licence, accreditation, mark, standard-setter, rank, percentile. Results are ranges. "No one is ranked."
- No em dashes in copy, comments or documentation.
- No Google or Meta scripts on any page. No open or click tracking in email. Cookieless visitor counts only.
- Entries are sent by platforms to Muslim Quotient. Muslim Quotient never pulls, scrapes or reads another product's database.
- People are shown under a given name (for example Quiet Cedar) that changes every 30 days. Never show real names.
- Design: tokens and screens come from the Muslim Quotient ID design canvas. Solid colours only, no gradients, glow or blur. Background `#0c121d`, card `#18212f`, ink `#2c3a52`, navy `#3a4c6b`, plum `#8a6ca6`, lilac `#c9b6dc`, muted `#9dadc6`, focus gold `#d9b46a`. Fonts Outfit and Amiri. Must work at 360px wide.
- Security: PKCE on every sign-in, pairwise subject IDs (our three products in one sector group), refresh tokens rotated on use, email encrypted in its own table, signed notices to clients, rate limits as in the PRD.
- Every change to the entry vocabulary or the developer guide is a versioned change with a date.

## Commands

```bash
npm install
npm run dev
npm run build
npm run test
```
