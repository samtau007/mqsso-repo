# Muslim Quotient ID PRD and Build Plan

8 October 2026 · Sami (TrueQ Technologies)

Changes: 8 October 2026, decisions 2 to 4 settled (no questions on Muslim Quotient; Postmark for the relay; Mohasaba keeps Continue with Google for now).

Phase 1 makes Muslim Quotient one private account across muslimquotient.com, istighfar.club and Mohasaba, with a "Sign up with Muslim Quotient" option inside both, and a dashboard that shows what each one adds. istighfar.club and Mohasaba connect exactly as any outside platform would, through the developer portal and the public developer guide, so every gap is found and fixed before a real partner arrives.

Positioning for people: "Muslim Quotient helps you grow as a Muslim. Your direction, across every Muslim platform." For platforms and investors: "Central identity, distributed learning."

## 1. Scope

Phase 1 connects only our own three products, using the same standards outside platforms will use later.

**In phase 1**

- A sign-in service at `id.muslimquotient.com`: email code, passkeys, permission screens, a different private ID per platform, the email choice (share or relay), and the rotating given name.
- A record service at `api.muslimquotient.com` that accepts entries under Learning, Practice and Reflection.
- The web dashboard at `muslimquotient.com`: Overview, My goals, My picture, My platforms, Prayer settings, Privacy.
- A basic developer portal at `developers.muslimquotient.com`: register a platform, set redirect and notice addresses, get keys.
- "Sign up with Muslim Quotient" and "Sign in with Muslim Quotient" on istighfar.club (web and Chrome extension) and on Mohasaba.
- Linking and merging for people who already have an istighfar.club or Mohasaba account, with their past activity brought across; account merging inside Muslim Quotient too.

**Not in phase 1**

- Outside partners, developer kits (Flutter first) and device-checked entries.
- Discover (suggestions of platforms and courses).
- The iOS and Android apps, and screenshot blocking, which only phone apps can do well.
- Teacher circle ranges in Muslim Quotient (Mohasaba keeps its own).

## 2. How data reaches Muslim Quotient

Muslim Quotient never pulls data out of other products. Each product sends entries to Muslim Quotient when something happens, using the token it received when the person signed in, and only for the parts the person allowed.

```
Our products                    Muslim Quotient
+-------------------+   1. sign in, returns a    +-------------------+
| istighfar.club    | ----- private ID --------> | Sign-in service   |
| Chrome extension  |                            | id.muslimquotient |
| Mohasaba          |                            +---------+---------+
| muslimquotient.com|                                      | permissions
+-------------------+   2. send entries with     +---------v---------+
         |             the person's token        | Record service    |
         +-----------------------------------> | api.muslimquotient |
                                                 +---------+---------+
                                                           | checks what was allowed
                                                 +---------v---------+
                                                 | MQ database       |
                                                 | entries and goals |
                                                 +---------+---------+
                                                           |
                                                 +---------v---------+
                                                 | Dashboard         |
                                                 | only the person   |
                                                 +-------------------+
```

- **Live entries.** When a person keeps their daily istighfar or finishes a Mohasaba sitting, that product calls `POST /v1/record`. The entry appears in the dashboard within seconds.
- **One-time history.** After someone links an existing account, the product sends their past activity once through `POST /v1/record/import`, with original dates, after the person approves a preview.
- **Never.** Muslim Quotient does not log in to other products, read their databases, or scrape their pages. A product that stops sending simply stops appearing.
- **How an entry reaches the right person.** A product sends an entry with its access token. The record service reads the private ID inside that token, looks it up in `connections` to find the person's internal ID, checks the permission, and saves the entry under the internal ID. The dashboard reads entries by internal ID, so activity from every product appears together.

Outside platforms will connect the same way later, which is why our own products use the public method from day one.

## 3. System design

Five parts. We own and run the sign-in service; the rest sits on managed services.

| Part | Address | Built with | Why |
| --- | --- | --- | --- |
| Sign-in service | `id.muslimquotient.com` | Our own service built on node-oidc-provider (OpenID certified), running in Node next to the dashboard | We own it and pay no per-person fees; it follows OAuth 2.1 and OpenID Connect, so any platform's standard library connects; PKCE, renewing refresh tokens, a different private ID per platform and fine-grained permissions are built in. We build the sign-in and permission screens |
| Muslim Quotient database | One new Supabase project, separate from Mohasaba | Postgres with row-level security | Keeps Muslim Quotient's records apart from each product's own data |
| Record service | `api.muslimquotient.com` | Next.js route handlers on Vercel | Checks the platform's token and the person's permission, then saves the entry |
| Dashboard and developer portal | `muslimquotient.com`, `developers.muslimquotient.com` | Next.js on Vercel | Same stack as Mohasaba, so one way of working |
| Email | Login codes and relay | Resend for codes (already used by istighfar.club), plus a relay on Postmark inbound routing that forwards mail | Codes on their own sending subdomain; no open or click tracking |

**How each product connects.** istighfar.club and Mohasaba each keep their own database and their own users table. They become ordinary clients of the sign-in service, exactly as an outside platform would. Each stores the private ID it receives (`mq_sub`) on its own user row. Nothing reads another product's database.

**Our products are treated as outside platforms.** Sharing one database would be a shortcut no outside partner gets. Each of our products keeps its own Supabase project and users table, registers in the developer portal, and uses only what the developer guide describes. Anything we have to work around becomes a fix in the guide or the service.

### One internal ID, a different ID for each platform

| Layer | ID | Who sees it | Used for |
| --- | --- | --- | --- |
| Inside Muslim Quotient | One internal ID per person | Only Muslim Quotient's own services | Joining every entry, goal and test result to one person, and all benchmarks |
| Given to platforms | A private ID per platform (pairwise) | Each platform sees only its own | Signing in and sending entries |

- muslimquotient.com, istighfar.club and Mohasaba are grouped (one sector identifier), so they share one private ID for a person. Every outside partner gets its own.
- Platforms cannot match people across their user lists. Only Muslim Quotient can join the picture, and anything it publishes (the Ummah Index, Discover suggestions) is an anonymous total with a minimum group size.

## 4. User flows

### A. New person signs up on istighfar.club or Mohasaba

1. Taps "Sign up with Muslim Quotient".
2. Lands on `id.muslimquotient.com`, enters an email, then the 6-digit code. Offered a passkey.
3. Receives a given name (for example Quiet Cedar).
4. Sees the permission screen for that product, chooses "Hide my email" or "Share my email", and taps Allow.
5. Returns to the product signed in. The product creates its own user row with the private ID and the email it was given.

### B. Someone already signed in to Muslim Quotient

1. Taps the button on the other product.
2. No code needed: sees only that product's permission screen, then returns signed in.

### C. Existing istighfar.club or Mohasaba user links their account

1. Signs in the old way, then taps "Connect Muslim Quotient" in settings, or taps the Muslim Quotient button and answers "Already have an account here?" by proving the old account once.
2. The product stores the private ID on the existing user row.
3. The product asks once to bring past activity across. The person sees a preview in Muslim Quotient and approves.
4. The person may then use Muslim Quotient only to sign in.

### D. Signs up directly on muslimquotient.com

Same as A, steps 2 to 3, then the dashboard with suggested next steps: "Connect istighfar.club", "Take your first Mohasaba". Muslim Quotient asks no questions of its own; the five entry questions belong to Mohasaba only.

### E. Disconnect or delete

- Disconnecting a product in My platforms stops new entries and sends that product a `connection.revoked` notice. The person can also remove what it added.
- Deleting the Muslim Quotient account removes the email, record and given names, and sends `account.deleted` to every connected product. Each product keeps or deletes its own account under its own policy.

## 5. Changes to istighfar.club

istighfar.club keeps its current sign-in and gains Muslim Quotient as the first option.

**Web (istighfar.club)**

- The verify prompt that appears after the 10 free reminders shows "Sign up with Muslim Quotient" first, then "Continue with email".
- Settings gains "Connect Muslim Quotient" for existing accounts, and "Disconnect" once linked.
- A callback route `/auth/mq/callback` exchanges the code, stores `mq_sub` and the given email on the user row, and signs the person in with the existing session system.
- Listens for `connection.revoked` and `account.deleted` notices at `/api/mq/notices`.

**Chrome extension**

- Signs in through `chrome.identity.launchWebAuthFlow` with PKCE, using the extension's own redirect address registered as a client.
- Keeps the access token in `chrome.storage.session` and the refresh token in `chrome.storage.local`, cleared on sign-out.
- Signing in on the website and in the extension uses the same Muslim Quotient session, so the second sign-in is one tap.

**What istighfar.club sends to Muslim Quotient**

| When | Entry | Example |
| --- | --- | --- |
| Once a day, for a day with at least one istighfar | `practice` · `act.kept` | "Daily istighfar kept", 7 Oct |
| Once, after linking | `practice` history import | Past days kept, with their dates |

The count of istighfar per day is not sent until TJ rules on whether Practice records counts. istighfar.club's own streaks stay inside istighfar.club; Muslim Quotient shows days kept and never a streak.

**Bringing existing users across.** Send one email through Resend to verified users: "Your istighfar.club account can now use Muslim Quotient." The link opens the Connect page. No tracking pixels.

## 6. Changes to Mohasaba

Mohasaba's sign-in page shows "Sign up with Muslim Quotient" above the existing email code option. "Continue with Google" stays beside it for now, and is removed later, once existing accounts have linked.

- Callback route `app.mohasaba.io/auth/mq/callback` stores `mq_sub` and the email on Mohasaba's own user row, then continues into the normal entry flow.
- Settings gains "Connect Muslim Quotient" and "Disconnect".
- Circles, partner views, payments and refunds stay entirely inside Mohasaba. Muslim Quotient never sees circle data.
- Listens for notices at `/api/mq/notices`, like istighfar.club.

**What Mohasaba sends to Muslim Quotient**

| When | Entry | Example |
| --- | --- | --- |
| After each completed sitting | `reflection` · `test.result`, one per domain, as a range | Worship 4–5 of 10 |
| When a sitting window opens | Reminder only, shown on the Goals page | "Your next Mohasaba window opens in 9 days" |
| Once, after linking | Past sitting results as ranges | Two earlier sittings |

Only ranges are sent. Single scores, individual answers and Ghaflah findings stay inside Mohasaba.

## 7. Requirements

**Sign-in service**

- [ ] Email code sign-up and sign-in; passkeys offered after the first sign-in
- [ ] Pairwise private IDs: a different `sub` for each client; our three products share one sector group
- [ ] Permission screen per client listing what it may do and never sees, with the email choice
- [ ] Relay address per person per client when "Hide my email" is chosen
- [ ] Given name created at sign-up and replaced every 30 days; old names kept only for the person's own view
- [ ] Clients registered through the developer portal; in phase 1 only ours: muslimquotient.com, istighfar.club web, istighfar.club extension, Mohasaba
- [ ] Signed notices to each client: `connection.revoked`, `account.deleted`, `settings.updated`
- [ ] Discovery document at `/.well-known/openid-configuration`

**Record service**

- [ ] `POST /v1/record` and `POST /v1/record/import`, as in the developer guide
- [ ] Rejects entries for parts the person has not allowed, any Reflection entry without a range, and unknown actions
- [ ] De-duplicates by `key`
- [ ] `GET /v1/settings` for prayer settings and language

**Dashboard**

- [ ] Overview: the range, this month by Learning, Practice and Reflection, journey. Reflection (and so the range) stays empty until Mohasaba is connected in M4
- [ ] My goals with "Continue in" links to the right product
- [ ] My platforms: connect, see what each added, disconnect, remove what it added
- [ ] Prayer settings and language, set once
- [ ] Privacy: given name, email choice per platform, relays list, merge accounts, export, delete account
- [ ] Ranges hidden until held, blurred when the tab loses focus
- [ ] No Google or Meta scripts; cookieless visitor counts only

**Developer portal**

- [ ] Register a platform: name, website, description, redirect addresses, notice address, sends from server or devices or both
- [ ] Shows client ID and secret once; rotate secret
- [ ] Links to the developer guide; approval switch controlled by us

## 8. Data model

In the Muslim Quotient Postgres database. Person identity lives in the sign-in service's tables; this schema keys everything by the internal person ID.

| Table | Holds | Notes |
| --- | --- | --- |
| `people` | Internal ID, created date, current given name, name changes on | No email here |
| `email_vault` | Internal ID, encrypted email | Separate table, encrypted, readable only by the sign-in and relay services |
| `given_names` | Internal ID, name, from, to | Shown only to the person |
| `clients` | Each platform: name, redirect addresses, allowed scopes, notice address, signing secret, sector group, sends from | Four rows in phase 1 |
| `connections` | Internal ID, client, pairwise `sub`, scopes granted, email choice, relay address, connected and revoked dates | One row per person per platform |
| `entries` | Internal ID, client, type, action, title, progress, unit, amount, range, occurred at, tz, vocabulary version, key, source (server or device) | Unique on client + key |
| `goals` | Internal ID, title, target date (Hijri), client to continue in, status | Progress read from entries |
| `settings` | Internal ID, prayer location (city level), method, ʿAṣr, Hijri adjustment, language, tz | |
| `audit_log` | Who did what and when: connects, imports, merges, deletions, notices sent | Kept for security, no content |

Row-level security: a person reads only their own rows; clients never read; only the record service writes entries.

## 9. Account linking and merging

Duplicate accounts will be the most common support problem. Every platform, ours included, needs these flows.

- **Link from settings.** A signed-in person taps "Connect Muslim Quotient", approves, and the platform stores `mq_sub` on the existing user row.
- **Link at sign-in.** A person taps the button and the platform does not know the `mq_sub`. It asks "Already have an account here?". Yes: prove the old account once (old password or email code from the platform), then link. No: create a new user.
- **Merge on the platform.** If a second account was created by mistake, the platform offers "Merge with my old account": prove the old account, move its data to the new one, retire the old one. The developer guide shows this flow.
- **Merge inside Muslim Quotient.** A person who made two Muslim Quotient accounts (two emails) can merge them from Privacy: sign in to both, choose which stays, entries and connections move across, the other is deleted.
- **Recovery.** Passkeys on at least one device, plus printable recovery codes, so a person who hid their email everywhere and later lost that mailbox can still get in.
- **History from the device.** Many apps keep progress on the phone only. The import call accepts batches from the app itself (see device-checked entries) the next time the app opens after linking.

## 10. Entry vocabulary

Small and versioned, so platforms can express what they do and the dashboard can still add it up.

| Part | Actions | Fields |
| --- | --- | --- |
| `learning` | `lesson.completed`, `course.started`, `course.completed`, `gathering.attended`, `text.read` (a page, verse or hadith), `verse.memorised` | `title`, optional `progress {done, of}`, optional `unit` (`page`, `verse`, `hadith`, `minute`) and `amount` |
| `practice` | `act.kept` | `title`; `amount` only once TJ rules on counts |
| `reflection` | `test.result` | `title`, `range {low, high, of}` |

- Every entry carries `occurred_at` in UTC plus the person's `tz` at the time, so "a day" is the person's own day. Hijri dates are derived by Muslim Quotient from that, with the person's Hijri adjustment.
- `vocabulary_version` is sent with each entry (phase 1: `1`). New actions are added by us, never by platforms; anything unknown is rejected with a clear error.

## 11. Device-checked entries (phase 2, for apps without a server)

Most Islamic apps run on Firebase with no backend. They can sign people in, but cannot call the record service server-to-server. Phase 2 allows entries from the app itself under these rules.

- The app sends entries with the person's access token plus a device attestation: Apple App Attest on iOS, Google Play Integrity on Android, and nothing on the web (web apps must use a server).
- Allowed from devices: `learning` and `practice` entries and history imports. Not allowed from devices: `reflection` results, which always need a server.
- Tighter limits for device-sent entries (20 a minute, 500 a day per person per platform) and anomaly checks (impossible volumes, future dates).
- A platform declares in the developer portal whether it sends from a server, from devices, or both; the portal shows the matching guide.

## 12. Developer kits and starter app (phase 2)

The kits are how the long tail joins. Build them in this order, because this is what Islamic apps are written in.

1. **Flutter** package: button, sign-in flow with PKCE and the system browser, token storage, settings reader, entry sender with attestation.
2. **React Native / Expo** package, same surface.
3. **Swift** and **Kotlin** packages for native apps.
4. **JavaScript** package for web and Node servers.
5. **A starter app** (Flutter) with Muslim Quotient wired in: sign-in, prayer settings, entries, and the Sign in with Apple requirement handled, since Apple requires it beside any third-party sign-in.
6. **Templates per app type** in the guide: Quran reader, memorisation, hadith, courses, dhikr counter, prayer times (settings only), each naming exactly which entries to send.
7. **Sandbox** with test people, a self-check tool that validates a platform's entries, and a "Works with Muslim Quotient" mark after review.

## 13. Privacy and security

- PKCE on every sign-in, including server-side clients; short-lived access tokens; refresh tokens rotated on use.
- Pairwise IDs so no two platforms share an identifier for the same person.
- Email encrypted at rest, in its own table; real email given to a platform only when the person chose "Share my email".
- Relay addresses can be switched off by the person; mail to a switched-off relay is dropped.
- Notices signed with each client's secret; clients verify before acting.
- Rate limits on codes (5 per hour per email) and on record writes (60 a minute per person from servers; 20 a minute and 500 a day from devices).
- No advertising, analytics or tracking scripts from Google or Meta on any Muslim Quotient page; emails carry no open or click tracking.
- Delete means delete: account deletion removes email, entries, goals and names within 30 days, and tells every connected platform.
- India's DPDP Act 2023 and GDPR followed; option to keep some data on the device only, considered in phase 3.
- An outside security review before any outside partner connects.

## 14. Running the sign-in service

Owning sign-in means that when `id.muslimquotient.com` is down, every connected platform's sign-in is down. Before any outside partner connects:

- Hosted on two regions behind a load balancer, Postgres with automatic failover and daily tested restores.
- Signing keys rotated on a schedule with old keys published until tokens expire.
- A public status page and an incident email list for platforms.
- Monitoring on sign-in success rate, token exchange errors and entry rejections.
- A written uptime promise (start at 99.9%) and a security review by an outside firm.
- Sign-in works when the record service is down, and the record service queues entries when the database is slow.

## 15. Challenges to plan for

| Challenge | What we do about it |
| --- | --- |
| Big ad-funded apps will not send data outward | Start with mission-driven apps and the long tail; approach big apps last, with Discover as the reason |
| The dashboard is empty until platforms connect | Goals and our own three products carry the first months; be honest about low return visits until then |
| A central record of religious practice is a target, legally and politically | Email in a separate encrypted vault, data minimisation, no advertising, DPDP and GDPR followed, option to keep some data on the device only |
| Fake platforms and inflated entries | Manual approval, rate limits, attestation, anomaly checks, and removal with users told |
| The name "Quotient" sounds like a score | Ranges only, everywhere; TJ's view on the name; trademark check |
| Relay emails confuse people and support | Clear wording at the choice, a Privacy page that lists every relay, and one-tap switch-off |
| Apple requires Sign in with Apple beside any third-party sign-in | Kits and the starter app include it |
| Most existing apps have no server | Device-checked entries in phase 2 |
| Progress lives on the phone in many apps | Import from the device after linking |

## 16. Build order

About nine weeks of work with Claude Code, scheduled so none of it delays Mohasaba's launch. Each milestone ends with something usable.

| Milestone | Weeks | Ships | Done when |
| --- | --- | --- | --- |
| M0 Decisions | 1 | Postgres project created, domains set up | Decisions 2 to 4 below are made |
| M1 Sign-in service | 2–3 | `id.muslimquotient.com` built on node-oidc-provider with email code, permission screen and given name, plus a basic developer portal to register platforms | A test platform registers in the portal, follows the developer guide, and signs a person in |
| M2 muslimquotient.com | 3–4 | Starter project moved onto the sign-in service; basic dashboard | Sign up on muslimquotient.com works end to end |
| M3 istighfar.club | 4–5 | Button on web and extension, linking and merging, daily Practice entries, history import | An existing istighfar.club user links and sees days kept in the dashboard |
| M4 Mohasaba | 5–6 | Button on sign-in, linking and merging, Reflection ranges after sittings | A sitting result appears as a range in the dashboard |
| M5 Dashboard v1 | 6–8 | Overview, Goals, My platforms, Privacy (with merge and relays), Prayer settings | All screens in the design work with real data |
| M6 Email relay and hardening | 8–9 | Relay addresses, notices, rate limits, deletion, audit log, status page | Disconnect and delete work across all three products |

After phase 1: security review, then the Flutter kit and device-checked entries, then the developer guide goes to the first outside partner.

## 17. Tasks for Claude Code

One repository per product. Give Claude Code this document and the developer guide, then one milestone at a time.

**muslimquotient (this repository: sign-in service, record service, dashboard, portal)**

1. Build the sign-in service on node-oidc-provider with a Postgres storage adapter and pairwise IDs (our three products in one sector group), and build the sign-in, code and permission pages at `id.muslimquotient.com`.
2. Create the Postgres schema in the data model, with row-level security.
3. Build `/v1/record`, `/v1/record/import` and `/v1/settings`, checking tokens, granted scopes and the vocabulary.
4. Build the given-name generator and the 30-day rotation job.
5. Build the dashboard screens from the design canvas, including merge accounts and the relays list under Privacy.
6. Build notice sending to clients, signed with each client's secret, and the basic developer portal: register a platform, set redirect addresses and notice address, choose server or device sending, get keys.
7. Build the email relay on Postmark inbound routing, and the status page.

**istighfar-club**

1. Register the web and extension clients in the developer portal, and from here on use only what the developer guide says; note anything unclear as a fix for the guide.
2. Add `mq_sub`, `mq_email` and `mq_linked_at` to the users table.
3. Add the Muslim Quotient button to the verify prompt and the sign-in page; add Connect, Merge and Disconnect in settings.
4. Add `/auth/mq/callback` and `/api/mq/notices`.
5. In the extension, add `chrome.identity.launchWebAuthFlow` sign-in with PKCE.
6. Add a daily job that sends one `practice` entry per day kept; add the one-time history import after linking.

**mohasaba**

1. Register the client in the developer portal and follow only the developer guide, noting anything unclear as a fix for the guide.
2. Add `mq_sub`, `mq_email` and `mq_linked_at` to the users table.
3. Add the button to the sign-in page; Connect, Merge and Disconnect in settings.
4. Add `/auth/mq/callback` and `/api/mq/notices`.
5. After each completed sitting, send one `reflection` range per domain; add the one-time import of past sittings.

**Shared rules for every repository**

- Read this document and the developer guide before writing code. Ask Sami before deciding anything not written here; do not write undecided things as settled.
- Spelling is Mohasaba with an o. Never use: streak, tracker, gamified, leaderboard, app (in public copy), cohort, certification, certified, licence, accreditation, mark, standard-setter, rank, percentile. Results are ranges.
- No Google or Meta scripts anywhere. No open or click tracking in email.
- No em dashes in any copy or documentation.
- Design tokens and screens come from the Muslim Quotient ID design canvas; solid colours only.
- Every change to the entry vocabulary or the developer guide is a versioned change with a date.

## 18. Where this goes (phases after 1)

| Phase | Adds | Gate to start |
| --- | --- | --- |
| 2. First partners | Developer kits (Flutter first), device-checked entries, Greentech or similar as anchor partner, security review | Phase 1 live and stable for 30 days; TJ's rulings on Practice and recording |
| 3. Open | Any platform can apply; Discover (what helped people like you, outcomes-based, no paid placement in the evidence); phone app with screenshot protection | At least three outside partners sending entries; enough data for Discover to mean something |
| 4. Circles and institutions | Teachers see anonymous ranges for their students across platforms; masjids and schools record attendance and classes; Ummah Index published with scholarly oversight | Minimum circle sizes agreed with TJ; research partner in place |
| 5. Standard and companion | The record format and sign-in rules published as an open standard with open-source reference code, overseen by a body that includes scholars; a private companion that sees only the person's own record and never gives rulings | Decision on openness made by Sami and TJ before phase 2 partner talks, because it changes the pitch |

## 19. Decisions and success measures

**Decisions needed before M1**

- [x] 1. Settled: our own sign-in service on node-oidc-provider, with Postgres in Supabase used only as the database. Ory Hydra is the fallback if relying on one main maintainer becomes a concern
- [x] 2. Settled: the five questions belong to Mohasaba only. Muslim Quotient shows no questions at all, now or later
- [x] 3. Settled: the email relay runs on Postmark
- [x] 4. Settled: Mohasaba keeps "Continue with Google" for now; Sign in with Muslim Quotient is added beside it in M4, and Google is removed later, once existing accounts have linked
- [ ] 5. TJ: whether Practice may record counts, or only days kept
- [ ] 6. Will the record format and sign-in rules be published as an open standard? Decide before the first partner conversation (Sami and TJ)
- [ ] 7. Trademark search for Muslim Quotient, and TJ's view on the word Quotient

**How we know phase 1 worked (first 90 days after M6)**

| Measure | Target |
| --- | --- |
| Share of new istighfar.club and Mohasaba sign-ups that use Muslim Quotient | Over half |
| Existing istighfar.club users who link | 1 in 5 of verified users |
| People who return to the dashboard at least twice a month | 1 in 4 |
| Security incidents | None |

The targets are starting guesses, to be reset after the first month of real numbers.
