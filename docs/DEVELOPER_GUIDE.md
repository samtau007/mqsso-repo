# Muslim Quotient Developer Guide

Version 1 · 8 October 2026 · draft for early partners. Addresses marked as examples will be confirmed before launch.

Add "Sign in with Muslim Quotient" to your platform using standard OpenID Connect, then bring your existing users across without losing their accounts or their history.

## How it works

The person signs in and approves on Muslim Quotient, never on your platform. You receive a private ID made only for you, plus the permissions the person allowed.

1. **Taps the button** on your platform: "Sign in with Muslim Quotient".
2. **Signs in** on Muslim Quotient with an email code or passkey.
3. **Approves**: sees what you asked for and what you never receive.
4. **Returns to you**: your callback gets a one-time code and your state value.
5. **You exchange the code** on your server, with PKCE, and receive the private ID (`sub`).
6. **You use what was allowed**: read settings, add entries, through the Muslim Quotient API.

The person's other platforms and their record never leave Muslim Quotient. You receive an email address in the form the person chooses: their real email, or a private relay address that forwards to them.

## Quick start

Muslim Quotient is a standard OpenID Connect provider, so any sign-in library you already use (Auth.js, Passport, AppAuth, Firebase custom OIDC) works without special code.

1. **Register your platform** in the developer portal (example address: `developers.muslimquotient.com`). Give your name, website, a short description, your redirect address, your notice address, and whether you send entries from a server, from devices, or both. You receive a `client_id` and a `client_secret`. Platforms are approved before they go live.
2. **Add the button.** Use the official button from the portal: white on dark screens, night blue on light screens, label "Sign in with Muslim Quotient".
3. **Send the person to Muslim Quotient** with the permissions you need:

```http
GET https://id.muslimquotient.com/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourplatform.com/auth/mq/callback
  &response_type=code
  &scope=openid email mq.settings.prayer mq.record.learning
  &state=RANDOM_STRING
  &code_challenge=PKCE_CHALLENGE
  &code_challenge_method=S256
```

4. **Exchange the code** your callback receives for tokens:

```http
POST https://id.muslimquotient.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=CODE&redirect_uri=...&client_id=...&client_secret=...&code_verifier=PKCE_VERIFIER
```

5. **Read the person's ID** from the `sub` value in the ID token. Store it against your user. That is the only identifier you will ever receive for this person.

```json
{
  "iss": "https://id.muslimquotient.com",
  "sub": "mq_hn_7f3a92c1e8",
  "aud": "YOUR_CLIENT_ID",
  "email": "qc7f3a@relay.muslimquotient.com",
  "iat": 1791358400
}
```

The discovery document lists every address and key: `https://id.muslimquotient.com/.well-known/openid-configuration`. PKCE is required for every platform, including server-side ones.

## What you can ask for

Ask only for what your platform uses. The person sees each permission in plain words and can refuse any of them.

| Permission (`scope`) | What you get | What the person sees |
| --- | --- | --- |
| `openid` | A private ID for this person, different from the one every other platform gets | Always included |
| `email` | A working email address: the person's real one, or a private relay address that forwards to them. The person decides | "Share my email" or "Hide my email" |
| `mq.name` | The display name the person chose, which may not be their real name | "See the name you chose to show" |
| `mq.settings.prayer` | Location for prayer times, calculation method, ʿAṣr method, Hijri adjustment | "Use your prayer settings" |
| `mq.settings.language` | Preferred language and script | "Use your language" |
| `mq.record.learning` | Permission to add lessons, courses, reading and gatherings to Learning | "Add what you learn here to your record" |
| `mq.record.practice` | Permission to add acts to Practice | "Add what you practise here to your record" |
| `mq.record.reflection` | Permission to add test results, as ranges, to Reflection | "Add your results here to your record" |
| `mq.record.import` | A one-time permission to add the person's past history | "Bring your past activity here into your record" |
| `mq.circle` | Anonymous ranges for a circle you run, once it has at least 30 people | "Count you, anonymously, in this circle's ranges" |

**You never receive:** the person's phone number, real name, what other platforms they use, or anything another platform added to their record. Reading the record is not offered to platforms at all; only the person sees it.

**Email:** with `email` you always get an address you can write to. If the person chose "Hide my email", it looks like `qc7f3a@relay.muslimquotient.com`. Mail you send there reaches the person's real inbox. Treat it exactly like a real address, and never try to find the real address behind it.

## Bringing your existing users across

Existing users keep their account on your platform. What moves to Muslim Quotient is how they sign in, and, if they agree, their past activity. Their notes, purchases and content stay with you.

Do not match accounts by email. Many people will give you a relay address, so the email you receive may not match the one you already hold. Each person links their own account once, in one of three ways.

| Way | When to use it | What happens |
| --- | --- | --- |
| Connect from settings | The person is already signed in to your platform | They tap "Connect Muslim Quotient" in their settings, approve, and you store the `sub` on their existing user |
| Link at sign-in | The person taps the Muslim Quotient button and you do not know their `sub` yet | You ask "Already have an account here?" They sign in the old way once, and you link the two. Otherwise you create a new user |
| Invite by email | You want existing users to move over | You email your users a link to the "Connect" page. You already hold their emails; Muslim Quotient does not need them |

### Merging a duplicate account

If a person signed up fresh through Muslim Quotient and later finds their old account, offer "Merge with my old account": they prove the old account once (old password or your email code), you move its data onto the account that carries the `sub`, and retire the old one. Tell them what moved.

### Importing past activity

After linking, you may ask once for `mq.record.import` and send the person's history with its original dates.

```http
POST https://api.muslimquotient.com/v1/record/import
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "vocabulary_version": 1,
  "entries": [
    { "type": "learning", "action": "lesson.completed", "title": "Tajwid, lesson 1", "occurred_at": "2025-11-02T16:00:00Z", "tz": "Asia/Kolkata", "key": "lesson-981" },
    { "type": "learning", "action": "gathering.attended", "title": "Friday halaqa", "occurred_at": "2025-11-07T19:30:00Z", "tz": "Asia/Kolkata", "key": "halaqa-2231" }
  ]
}
```

- The person sees a preview in Muslim Quotient ("Halaqa Notes wants to add 214 past entries") and approves or declines the whole import.
- Import is allowed once per person, within 30 days of linking, up to 5,000 entries. The `key` on each entry stops duplicates if you resend.
- If your app keeps progress on the device, send the import from the app the next time it opens after linking (see device-sent entries).

### Retiring your old sign-in

Once linked, you can offer "Sign in with Muslim Quotient only" and delete the person's password. Keep your own user record. If the person later disconnects, let them set a password again or sign in with an email code from your side.

## Adding to a person's record

Every entry goes under one of three parts. Send an entry when the act happens, with the access token from sign-in.

| `type` | For | `action` values | Must carry |
| --- | --- | --- | --- |
| `learning` | Lessons, courses, reading, memorisation, halaqas, lectures | `lesson.completed`, `course.started`, `course.completed`, `gathering.attended`, `text.read`, `verse.memorised` | `title`; `progress {done, of}` when there is one; optional `unit` (`page`, `verse`, `hadith`, `minute`) with `amount` |
| `practice` | Acts the person chooses to keep | `act.kept` | `title`; `amount` is not accepted yet |
| `reflection` | Tests and self-assessments | `test.result` | A `range {low, high, of}`. A single score or a rank is refused |

Every entry carries `occurred_at` in UTC, the person's `tz` at the time, a `key` unique within your platform, and `vocabulary_version` (currently `1`). Unknown actions are rejected with a clear error.

```http
POST https://api.muslimquotient.com/v1/record
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "vocabulary_version": 1,
  "type": "learning",
  "action": "lesson.completed",
  "title": "Tajwid, lesson 8: Qalqalah",
  "occurred_at": "2026-10-05T14:20:00Z",
  "tz": "Asia/Kolkata",
  "progress": { "done": 8, "of": 20 },
  "key": "lesson-1188"
}
```

```json
{
  "vocabulary_version": 1,
  "type": "reflection",
  "action": "test.result",
  "title": "Worship",
  "range": { "low": 4, "high": 5, "of": 10 },
  "occurred_at": "2026-10-05T18:00:00Z",
  "tz": "Asia/Kolkata",
  "key": "sitting-77"
}
```

- The reply is `201` with the entry's id, or `403` if the person has not allowed that part.
- Entries are write-only for platforms. You cannot read them back, and you cannot see what others added.
- From a server: up to 60 entries a minute per person. Resending the same `key` returns the first entry, not a copy.

### Sending from the app itself (no server)

If your platform has no server, you may send `learning` and `practice` entries and imports directly from your app, with a device attestation: Apple App Attest on iOS, Google Play Integrity on Android. Web apps must use a server. `reflection` results always need a server. Device-sent entries are limited to 20 a minute and 500 a day per person. Set "sends from devices" in the developer portal to see the matching kit instructions.

## Prayer settings and language

People set these once in Muslim Quotient. Read them after sign-in instead of asking again.

```http
GET https://api.muslimquotient.com/v1/settings
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "prayer": {
    "location": { "city": "Hyderabad", "lat": 17.385, "lng": 78.4867 },
    "method": "MWL",
    "asr": "hanafi",
    "hijri_adjust": 0
  },
  "language": "en",
  "tz": "Asia/Kolkata",
  "updated_at": "2026-10-01T09:00:00Z"
}
```

The location is rounded to the city unless the person allows more. Check `updated_at` when the person returns, or listen for the `settings.updated` notice.

## When a person disconnects or deletes

Muslim Quotient sends signed notices to the address you register. Respond within 30 days.

| Notice | Means | You must |
| --- | --- | --- |
| `connection.revoked` | The person disconnected your platform | Stop sending entries. Keep their account on your side, and offer another way to sign in |
| `account.deleted` | The person deleted their Muslim Quotient account | Remove the stored `sub`. Delete their data on your side if your own policy promises it |
| `settings.updated` | Prayer settings or language changed | Fetch `/v1/settings` again |

```json
{
  "event": "connection.revoked",
  "sub": "mq_hn_7f3a92c1e8",
  "at": "2026-10-07T08:12:00Z"
}
```

Check the `MQ-Signature` header with your signing secret before acting on any notice.

## Rules every platform agrees to

- Do not try to find out who a person is from their Muslim Quotient ID, or match IDs with other platforms.
- Treat a relay address exactly like a real one, and never try to find the real address behind it.
- Do not sell, rent or share anything you receive, and do not use it for advertising.
- Send only true entries about acts that happened on your platform.
- Reflection results are ranges. Never send or show ranks, percentiles or comparisons between people.
- Circle ranges are for the circle's teacher only and need at least 30 people.
- Do not describe your platform as certified, approved or endorsed by Muslim Quotient.
- If you offer Sign in with Muslim Quotient in an iOS app, Apple requires you to offer Sign in with Apple as well.
- Act on disconnect and delete notices within 30 days.

Platforms that break these rules lose access, and their users are told.

## Testing and going live

Every platform gets a test environment with sample people, at `id.sandbox.muslimquotient.com` and `api.sandbox.muslimquotient.com`. Nothing sent there reaches a real record.

- [ ] Sign-in works with PKCE and checks `state`
- [ ] You store only the `sub`, and link and merge existing accounts as described above
- [ ] You ask only for the permissions you use
- [ ] Entries use the right `type`, carry `tz` and `key`, and Reflection sends ranges only
- [ ] Your notice address checks signatures and handles all three notices
- [ ] The official button is used, unchanged
- [ ] Your privacy policy says what you send to Muslim Quotient

Send the checklist from the developer portal. Review takes up to 10 working days.

## Still to decide before this guide is final

- [ ] Which acts may be recorded under Practice at all, and whether counts are recorded (TJ's ruling)
- [ ] Who approves a platform before it goes live, and on what grounds (TJ and Sami)
- [ ] The final addresses, rate limits, import limits and review time
- [ ] Whether `mq.name` is offered, or platforms get no name at all
- [ ] Minimum circle size: 30 is carried over from Mohasaba
- [ ] Which service runs the email relay, and what happens when a person switches a relay off
