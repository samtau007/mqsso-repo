import type { PoolClient } from "pg";
import { audit } from "./audit";
import { decrypt, token } from "./crypto";
import { one, query, tx } from "./db";
import { env } from "./env";
import { inboxList, inboxRead as inboxOpenQuiet } from "./inbox";
import { sendNotice } from "./notices";

// What a person changes from their own dashboard. Every function here takes the person's
// internal ID from the website's session, never from a form.

/** Ends every sign-in this person gave this platform: its grant and every token under it. */
async function revokeGrants(c: PoolClient, personId: string, clientId?: string) {
  const grants = await c.query<{ id: string }>(
    `select id from oidc_payloads where type = 'Grant' and payload->>'accountId' = $1 ${clientId ? "and payload->>'clientId' = $2" : ""}`,
    clientId ? [personId, clientId] : [personId],
  );
  const ids = grants.rows.map((g) => g.id);
  if (ids.length) {
    await c.query("delete from oidc_payloads where grant_id = any($1)", [ids]);
    await c.query("delete from oidc_payloads where type = 'Grant' and id = any($1)", [ids]);
  }
}

/**
 * Disconnect: the platform can no longer sign the person in silently or add anything, and is
 * told with connection.revoked. With `removeAdded`, everything it added goes too.
 */
export async function disconnectPlatform(personId: string, clientId: string, removeAdded: boolean): Promise<boolean> {
  const conn = await tx(async (c) => {
    const r = await c.query<{ sub: string }>(
      "update connections set revoked_at = now() where person_id = $1 and client_id = $2 and revoked_at is null returning sub",
      [personId, clientId],
    );
    if (!r.rowCount) return null;
    await revokeGrants(c, personId, clientId);
    let removed = 0;
    if (removeAdded) {
      removed = (await c.query("delete from entries where person_id = $1 and client_id = $2", [personId, clientId])).rowCount ?? 0;
      await c.query("update imports set status = 'declined', pending = null, decided_at = now() where person_id = $1 and client_id = $2 and status = 'pending'", [personId, clientId]);
    }
    await audit({ actor: `person:${personId}`, action: "connection.revoked", personId, clientId, detail: { removed } }, c);
    return r.rows[0];
  });
  if (!conn) return false;
  await sendNotice({ clientId, event: "connection.revoked", sub: conn.sub, personId });
  return true;
}

/**
 * Takes back some of what a platform may do. Only taking back: a platform asks for more at
 * sign-in, where the person sees it. Sign-in itself (openid) cannot be taken back here; that is
 * Disconnect.
 */
export async function withdrawPermissions(personId: string, clientId: string, scopes: string[]) {
  const drop = scopes.filter((s) => s !== "openid");
  if (!drop.length) return;
  await query(
    "update connections set scopes = array(select unnest(scopes) except select unnest($3::text[])) where person_id = $1 and client_id = $2 and revoked_at is null",
    [personId, clientId, drop],
  );
  await audit({ actor: `person:${personId}`, action: "connection.narrowed", personId, clientId, detail: { withdrawn: drop } });
}

/**
 * Switches what email a platform sees. The platform receives the new address the next time it
 * reads the ID token or userinfo. A relay address, once made for a platform, is kept.
 */
export async function setEmailChoice(personId: string, clientId: string, choice: "share" | "hide") {
  if (choice === "share" && !(await one("select 1 from email_vault where person_id = $1", [personId]))) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await query(
        `update connections set email_choice = $3,
           relay_address = case when $3 = 'hide' then coalesce(relay_address, $4) else relay_address end
         where person_id = $1 and client_id = $2 and revoked_at is null and 'email' = any(scopes)`,
        [personId, clientId, choice, `${token(10)}@${env.relayDomain}`],
      );
      break;
    } catch (e) {
      if ((e as { code?: string }).code === "23505" && attempt < 2) continue;
      throw e;
    }
  }
  await audit({ actor: `person:${personId}`, action: "connection.email_choice", personId, clientId, detail: { choice } });
}

export type PrayerSettings = {
  city: string | null; lat: number | null; lng: number | null; method: string | null; asr: string | null;
  hijriAdjust: number; language: string | null; tz: string | null;
};

export const METHODS: Record<string, string> = {
  MWL: "Muslim World League",
  ISNA: "Islamic Society of North America",
  Egypt: "Egyptian General Authority of Survey",
  Makkah: "Umm al-Qura, Makkah",
  Karachi: "University of Islamic Sciences, Karachi",
  Tehran: "Institute of Geophysics, Tehran",
  Jafari: "Shia Ithna Ashari, Leva Institute",
  Gulf: "Gulf region",
  Kuwait: "Kuwait",
  Qatar: "Qatar",
  Singapore: "Majlis Ugama Islam Singapura",
  Turkey: "Diyanet, Turkey",
  Moonsighting: "Moonsighting Committee",
  Dubai: "Dubai",
};
export const ASR = { standard: "Standard (Shafiʿi, Maliki, Hanbali)", hanafi: "Hanafi" } as const;
export const LANGUAGES: Record<string, string> = {
  en: "English", ar: "العربية", ur: "اردو", hi: "हिन्दी", bn: "বাংলা", id: "Bahasa Indonesia", ms: "Bahasa Melayu",
  tr: "Türkçe", fr: "Français", de: "Deutsch", es: "Español", fa: "فارسی", so: "Soomaali", sw: "Kiswahili",
};

export class SettingsError extends Error {}

function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves prayer settings and language, set once for every platform. The location is kept to
 * two decimal places (about a kilometre). Platforms allowed to use them are told with
 * settings.updated.
 */
export async function saveSettings(personId: string, s: PrayerSettings) {
  if (s.method && !METHODS[s.method]) throw new SettingsError("Choose a calculation method from the list.");
  if (s.asr && !(s.asr in ASR)) throw new SettingsError("Choose an ʿAṣr method from the list.");
  if (s.language && !LANGUAGES[s.language]) throw new SettingsError("Choose a language from the list.");
  if (s.tz && !validTimeZone(s.tz)) throw new SettingsError("Choose a time zone from the list.");
  if (!Number.isInteger(s.hijriAdjust) || Math.abs(s.hijriAdjust) > 2) throw new SettingsError("The Hijri adjustment is from -2 to 2 days.");
  if ((s.lat === null) !== (s.lng === null)) throw new SettingsError("Give both latitude and longitude, or neither.");
  if (s.lat !== null && (Math.abs(s.lat) > 90 || Math.abs(s.lng!) > 180)) throw new SettingsError("That location is not on the map.");
  const city = s.city?.trim().slice(0, 80) || null;
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

  await query(
    `insert into settings (person_id, prayer_city, prayer_lat, prayer_lng, prayer_method, asr_method, hijri_adjust, language, tz, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (person_id) do update set prayer_city = excluded.prayer_city, prayer_lat = excluded.prayer_lat,
       prayer_lng = excluded.prayer_lng, prayer_method = excluded.prayer_method, asr_method = excluded.asr_method,
       hijri_adjust = excluded.hijri_adjust, language = excluded.language, tz = excluded.tz, updated_at = now()`,
    [personId, city, round(s.lat), round(s.lng), s.method, s.asr, s.hijriAdjust, s.language, s.tz],
  );
  await audit({ actor: `person:${personId}`, action: "settings.updated", personId });

  const told = await query<{ client_id: string; sub: string }>(
    `select client_id, sub from connections where person_id = $1 and revoked_at is null
       and scopes && array['mq.settings.prayer', 'mq.settings.language']`,
    [personId],
  );
  for (const c of told.rows) await sendNotice({ clientId: c.client_id, event: "settings.updated", sub: c.sub, personId });
}

export class GoalError extends Error {}

/** A goal: where the person is heading, by when (a Hijri month), and the platform to continue in. */
export async function addGoal(personId: string, g: { title: string; targetHijri: string | null; continueIn: string | null }) {
  const title = g.title.trim();
  if (title.length < 2 || title.length > 120) throw new GoalError("Write the goal in 2 to 120 characters.");
  if (g.continueIn) {
    const ok = await one("select 1 from connections where person_id = $1 and client_id = $2 and revoked_at is null", [personId, g.continueIn]);
    if (!ok) throw new GoalError("Choose one of your connected platforms.");
  }
  const count = await one<{ n: string }>("select count(*) as n from goals where person_id = $1 and status = 'active'", [personId]);
  if (Number(count!.n) >= 20) throw new GoalError("Up to 20 goals at a time. Mark one done or set one aside first.");
  await query(
    "insert into goals (person_id, title, target_hijri, continue_in) values ($1, $2, $3, $4)",
    [personId, title, g.targetHijri?.slice(0, 40) || null, g.continueIn],
  );
}

export async function setGoalStatus(personId: string, goalId: string, status: "active" | "done" | "set_aside") {
  await query("update goals set status = $3 where id = $2 and person_id = $1", [personId, goalId, status]);
}

/** Everything held about the person, for "Export my record". */
export async function exportRecord(personId: string) {
  const [person, names, email, connections, entries, goals, settings] = await Promise.all([
    one("select given_name, name_changes_on, created_at from people where id = $1", [personId]),
    query("select name, valid_from, valid_to from given_names where person_id = $1 order by valid_from", [personId]),
    one<{ email_ciphertext: string }>("select email_ciphertext from email_vault where person_id = $1", [personId]),
    query(
      `select cl.name as platform, cl.website, c.sub as private_id, c.scopes as allowed, c.email_choice, c.relay_address, c.connected_at, c.revoked_at
         from connections c join clients cl on cl.client_id = c.client_id where c.person_id = $1 order by c.connected_at`,
      [personId],
    ),
    query(
      `select cl.name as platform, e.type, e.action, e.title, e.progress_done, e.progress_of, e.unit, e.amount,
              e.range_low, e.range_high, e.range_of, e.occurred_at, e.tz, e.created_at as added_at
         from entries e join clients cl on cl.client_id = e.client_id where e.person_id = $1 order by e.occurred_at`,
      [personId],
    ),
    query("select title, target_hijri, status, created_at from goals where person_id = $1 order by created_at", [personId]),
    one("select prayer_city, prayer_lat, prayer_lng, prayer_method, asr_method, hijri_adjust, language, tz, updated_at from settings where person_id = $1", [personId]),
  ]);
  await audit({ actor: `person:${personId}`, action: "record.exported", personId });
  return {
    exported_at: new Date().toISOString(),
    note: "Everything Muslim Quotient holds about you.",
    given_name: person,
    past_given_names: names.rows,
    email: email ? decrypt(email.email_ciphertext) : null,
    platforms: connections.rows,
    entries: entries.rows,
    goals: goals.rows,
    settings,
    inbox: await Promise.all((await inboxList(personId)).map(async (m) => ({ ...m, ...(await inboxOpenQuiet(personId, m.id)) }))),
  };
}

/**
 * Deletes the person: email, names, connections, entries, goals and settings, at once. Every
 * connected platform is told with account.deleted. The audit log keeps that it happened, under
 * the internal ID only, with no content.
 */
export async function deleteAccount(personId: string, siteClientId: string) {
  const subs = await tx(async (c) => {
    const conns = await c.query<{ client_id: string; sub: string }>(
      "select client_id, sub from connections where person_id = $1 and revoked_at is null",
      [personId],
    );
    await revokeGrants(c, personId);
    await c.query("delete from oidc_payloads where type = 'Session' and payload->>'accountId' = $1", [personId]);
    await c.query("delete from people where id = $1", [personId]);
    await audit({ actor: `person:${personId}`, action: "person.deleted", personId, detail: { platforms: conns.rowCount } }, c);
    return conns.rows;
  });
  // muslimquotient.com is told by its own session ending, not by a notice to itself.
  for (const s of subs.filter((x) => x.client_id !== siteClientId)) {
    await sendNotice({ clientId: s.client_id, event: "account.deleted", sub: s.sub });
  }
}
