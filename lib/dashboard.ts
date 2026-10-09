import type { PoolClient } from "pg";
import { tx } from "./db";
import { NAME_DAYS } from "./names";

/**
 * Runs `fn` as the person: role mq_person with mq.person_id set, so row-level security lets
 * it see only that person's own rows. Everything the dashboard shows goes through here.
 */
export async function asPerson<T>(personId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return tx(async (c) => {
    await c.query("set local role mq_person");
    await c.query("select set_config('mq.person_id', $1, true)", [personId]);
    return fn(c);
  });
}

export type Overview = {
  givenName: string;
  daysToNewName: number;
  month: { learning: number; practiceDays: number; reflection: number };
  latestRanges: { title: string; low: number; high: number; of: number; from: string; at: Date }[];
  platforms: { clientId: string; name: string; website: string; scopes: string[]; connectedAt: Date; added: number }[];
  /** History imports waiting for the person to approve or decline. */
  imports: { id: string; name: string; entries: number }[];
};

/** The basic dashboard (M2). `siteClientId` is muslimquotient.com itself, which is not listed as a platform. */
export async function overview(personId: string, siteClientId: string, now: Date = new Date()): Promise<Overview | null> {
  return asPerson(personId, async (c) => {
    const p = (await c.query<{ given_name: string; name_changes_on: Date }>("select given_name, name_changes_on from people")).rows[0];
    if (!p) return null;

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const m = (await c.query<{ learning: string; practice_days: string; reflection: string }>(
      `select
         count(*) filter (where type = 'learning') as learning,
         count(distinct (occurred_at at time zone tz)::date) filter (where type = 'practice') as practice_days,
         count(*) filter (where type = 'reflection') as reflection
       from entries where occurred_at >= $1 and not test`,
      [monthStart],
    )).rows[0];

    const ranges = await c.query<{ title: string; range_low: string; range_high: string; range_of: string; name: string | null; occurred_at: Date }>(
      `select distinct on (e.title) e.title, e.range_low, e.range_high, e.range_of, cl.name, e.occurred_at
         from entries e left join clients cl on cl.client_id = e.client_id
        where e.type = 'reflection' and not e.test
        order by e.title, e.occurred_at desc`,
    );

    const platforms = await c.query<{ client_id: string; name: string | null; website: string | null; scopes: string[]; connected_at: Date; added: string }>(
      `select c.client_id, cl.name, cl.website, c.scopes, c.connected_at,
              (select count(*) from entries e where e.client_id = c.client_id) as added
         from connections c left join clients cl on cl.client_id = c.client_id
        where c.revoked_at is null and c.client_id <> $1
        order by c.connected_at`,
      [siteClientId],
    );

    const imports = await c.query<{ id: string; name: string | null; entry_count: number }>(
      `select i.id, cl.name, i.entry_count from imports i left join clients cl on cl.client_id = i.client_id
        where i.status = 'pending' order by i.created_at`,
    );

    const days = Math.max(0, Math.ceil((p.name_changes_on.getTime() - now.getTime()) / 86_400_000));
    return {
      givenName: p.given_name,
      daysToNewName: Math.min(days, NAME_DAYS),
      month: { learning: Number(m.learning), practiceDays: Number(m.practice_days), reflection: Number(m.reflection) },
      latestRanges: ranges.rows.map((r) => ({
        title: r.title, low: Number(r.range_low), high: Number(r.range_high), of: Number(r.range_of), from: r.name ?? "a platform", at: r.occurred_at,
      })),
      platforms: platforms.rows.map((r) => ({
        clientId: r.client_id, name: r.name ?? "A platform", website: r.website ?? "", scopes: r.scopes, connectedAt: r.connected_at, added: Number(r.added),
      })),
      imports: imports.rows.map((r) => ({ id: r.id, name: r.name ?? "A platform", entries: r.entry_count })),
    };
  });
}

// The rest of the dashboard (M5). Every read runs as the person, under row-level security.

export type PlatformCard = {
  clientId: string; name: string; website: string; scopes: string[]; emailChoice: "share" | "hide" | null;
  relayAddress: string | null; sub: string; connectedAt: Date; testMode: boolean;
  added: { learning: number; practice: number; reflection: number };
  practiceDaysThisMonth: number;
  latest: { type: string; title: string; detail: string | null; at: Date } | null;
};

function detailOf(r: { progress_done: number | null; progress_of: number | null; range_low: string | null; range_high: string | null; range_of: string | null; unit: string | null; amount: string | null }): string | null {
  if (r.range_low !== null) return `${Number(r.range_low)}–${Number(r.range_high)} of ${Number(r.range_of)}`;
  if (r.progress_of !== null) return `${r.progress_done} of ${r.progress_of}`;
  if (r.unit && r.amount !== null) return `${Number(r.amount)} ${r.unit}${Number(r.amount) === 1 ? "" : "s"}`;
  return null;
}

/** Every connected platform, with what it added. muslimquotient.com itself is not listed. */
export async function platformCards(personId: string, siteClientId: string, now: Date = new Date()): Promise<PlatformCard[]> {
  return asPerson(personId, async (c) => {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const r = await c.query(
      `select c.client_id, cl.name, cl.website, cl.approved, c.scopes, c.email_choice, c.relay_address, c.sub, c.connected_at,
              (select count(*) from entries e where e.client_id = c.client_id and e.type = 'learning') as learning,
              (select count(*) from entries e where e.client_id = c.client_id and e.type = 'practice') as practice,
              (select count(*) from entries e where e.client_id = c.client_id and e.type = 'reflection') as reflection,
              (select count(distinct (e.occurred_at at time zone e.tz)::date) from entries e
                 where e.client_id = c.client_id and e.type = 'practice' and e.occurred_at >= $2) as practice_days,
              l.type as l_type, l.title as l_title, l.occurred_at as l_at, l.progress_done, l.progress_of, l.range_low, l.range_high, l.range_of, l.unit, l.amount
         from connections c
         left join clients cl on cl.client_id = c.client_id
         left join lateral (select * from entries e where e.client_id = c.client_id order by e.occurred_at desc limit 1) l on true
        where c.revoked_at is null and c.client_id <> $1
        order by c.connected_at`,
      [siteClientId, monthStart],
    );
    return r.rows.map((x) => ({
      clientId: x.client_id, name: x.name ?? "A platform", website: x.website ?? "", scopes: x.scopes, emailChoice: x.email_choice,
      relayAddress: x.relay_address, sub: x.sub, connectedAt: x.connected_at, testMode: x.approved === false,
      added: { learning: Number(x.learning), practice: Number(x.practice), reflection: Number(x.reflection) },
      practiceDaysThisMonth: Number(x.practice_days),
      latest: x.l_title ? { type: x.l_type, title: x.l_title, detail: detailOf(x), at: x.l_at } : null,
    }));
  });
}

export type EntryLine = { id: string; type: string; title: string; detail: string | null; at: Date; test: boolean };

/** One platform's page: its connection and the latest things it added. */
export async function platformDetail(personId: string, clientId: string) {
  return asPerson(personId, async (c) => {
    const conn = (await c.query(
      `select c.client_id, cl.name, cl.website, c.scopes, c.email_choice, c.relay_address, c.sub, c.connected_at
         from connections c left join clients cl on cl.client_id = c.client_id
        where c.client_id = $1 and c.revoked_at is null`,
      [clientId],
    )).rows[0];
    if (!conn) return null;
    const entries = await c.query(
      `select id, type, title, occurred_at, progress_done, progress_of, range_low, range_high, range_of, unit, amount, test
         from entries where client_id = $1 order by occurred_at desc limit 20`,
      [clientId],
    );
    const total = await c.query<{ n: string }>("select count(*) as n from entries where client_id = $1", [clientId]);
    return {
      clientId: conn.client_id as string, name: (conn.name ?? "A platform") as string, website: (conn.website ?? "") as string,
      scopes: conn.scopes as string[], emailChoice: conn.email_choice as "share" | "hide" | null, relayAddress: conn.relay_address as string | null,
      sub: conn.sub as string, connectedAt: conn.connected_at as Date, total: Number(total.rows[0].n),
      entries: entries.rows.map((x): EntryLine => ({ id: x.id, type: x.type, title: x.title, detail: detailOf(x), at: x.occurred_at, test: x.test })),
    };
  });
}

/** Approved platforms the person has not connected, for "Connect a platform". */
export async function directory(personId: string, siteClientId: string) {
  return asPerson(personId, async (c) => {
    const r = await c.query<{ client_id: string; name: string; website: string }>(
      `select cl.client_id, cl.name, cl.website from clients cl
        where cl.client_id <> $1 and cl.approved
          and not exists (select 1 from connections c where c.client_id = cl.client_id and c.revoked_at is null)
        order by cl.name`,
      [siteClientId],
    );
    return r.rows;
  });
}

const HIJRI_MONTH = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "long", year: "numeric", timeZone: "UTC" });
const HIJRI_DAY = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "long", timeZone: "UTC" });

/** "Rabiʻ II 1448 AH" -> "Rabiʻ II 1448". */
export function hijriMonth(d: Date): string {
  return HIJRI_MONTH.format(d).replace(/\s*AH$/, "");
}
export function hijriDay(d: Date): string {
  return HIJRI_DAY.format(d);
}

export type Picture = {
  months: { label: string; learning: number; practiceDays: number }[];
  ranges: { title: string; points: { label: string; low: number; high: number; of: number; from: string }[] }[];
  byPlatform: { name: string; learning: number }[];
  middle: { title: string; done: number; of: number; from: string }[];
  journey: { at: Date; text: string }[];
};

/** My picture: the last six Hijri months, results as ranges, and where things stand. */
export async function picture(personId: string, siteClientId: string, now: Date = new Date()): Promise<Picture> {
  return asPerson(personId, async (c) => {
    const since = new Date(now.getTime() - 200 * 86_400_000);
    const rows = await c.query<{ type: string; title: string; occurred_at: Date; tz: string; day: string; name: string | null; client_id: string;
      progress_done: number | null; progress_of: number | null; range_low: string | null; range_high: string | null; range_of: string | null }>(
      `select e.type, e.title, e.occurred_at, e.tz, (e.occurred_at at time zone e.tz)::date::text as day, cl.name, e.client_id,
              e.progress_done, e.progress_of, e.range_low, e.range_high, e.range_of
         from entries e left join clients cl on cl.client_id = e.client_id
        where e.occurred_at >= $1 and not e.test order by e.occurred_at`,
      [since],
    );

    // Six Hijri months, oldest first, ending with the current one.
    const labels: string[] = [];
    for (let d = new Date(now); labels.length < 6; d = new Date(d.getTime() - 86_400_000)) {
      const l = hijriMonth(d);
      if (!labels.includes(l)) labels.unshift(l);
    }
    const months = labels.map((label) => ({ label, learning: 0, practiceDays: 0 }));
    const days = new Map<string, Set<string>>();
    for (const r of rows.rows) {
      const m = months.find((x) => x.label === hijriMonth(r.occurred_at));
      if (!m) continue;
      if (r.type === "learning") m.learning++;
      if (r.type === "practice") {
        const set = days.get(m.label) ?? new Set();
        set.add(r.day);
        days.set(m.label, set);
      }
    }
    for (const m of months) m.practiceDays = days.get(m.label)?.size ?? 0;

    const allRanges = await c.query<{ title: string; occurred_at: Date; range_low: string; range_high: string; range_of: string; name: string | null }>(
      `select e.title, e.occurred_at, e.range_low, e.range_high, e.range_of, cl.name from entries e left join clients cl on cl.client_id = e.client_id
        where e.type = 'reflection' and not e.test order by e.occurred_at`,
    );
    const byTitle = new Map<string, Picture["ranges"][number]>();
    for (const r of allRanges.rows) {
      const g = byTitle.get(r.title) ?? { title: r.title, points: [] };
      g.points.push({ label: hijriDay(r.occurred_at), low: Number(r.range_low), high: Number(r.range_high), of: Number(r.range_of), from: r.name ?? "a platform" });
      byTitle.set(r.title, g);
    }
    for (const g of byTitle.values()) g.points = g.points.slice(-6);

    const plat = await c.query<{ name: string | null; n: string }>(
      `select cl.name, count(*) as n from entries e left join clients cl on cl.client_id = e.client_id
        where e.type = 'learning' and e.occurred_at >= $1 and not e.test group by cl.name order by n desc limit 8`,
      [since],
    );

    const middle = await c.query<{ title: string; progress_done: number; progress_of: number; name: string | null }>(
      `select distinct on (e.client_id, e.title) e.title, e.progress_done, e.progress_of, cl.name
         from entries e left join clients cl on cl.client_id = e.client_id
        where e.progress_of is not null and not e.test order by e.client_id, e.title, e.occurred_at desc`,
    );

    const conns = await c.query<{ name: string | null; connected_at: Date }>(
      `select cl.name, c.connected_at from connections c left join clients cl on cl.client_id = c.client_id
        where c.revoked_at is null and c.client_id <> $1 order by c.connected_at`,
      [siteClientId],
    );
    const person = (await c.query<{ created_at: Date }>("select created_at from people")).rows[0];
    const journey: Picture["journey"] = [];
    if (person) journey.push({ at: person.created_at, text: "Made your Muslim Quotient ID" });
    for (const x of conns.rows) journey.push({ at: x.connected_at, text: `Connected ${x.name ?? "a platform"}` });
    const firstResult = allRanges.rows[0];
    if (firstResult) journey.push({ at: firstResult.occurred_at, text: `First result: ${firstResult.title} ${Number(firstResult.range_low)}–${Number(firstResult.range_high)}` });
    for (const x of middle.rows.filter((m) => m.progress_done === m.progress_of)) {
      const done = rows.rows.find((r) => r.title === x.title && r.progress_done === r.progress_of);
      if (done) journey.push({ at: done.occurred_at, text: `Finished ${x.title}` });
    }
    journey.sort((a, b) => a.at.getTime() - b.at.getTime());

    return {
      months,
      ranges: [...byTitle.values()],
      byPlatform: plat.rows.map((x) => ({ name: x.name ?? "A platform", learning: Number(x.n) })),
      middle: middle.rows.filter((x) => x.progress_done < x.progress_of).slice(0, 6)
        .map((x) => ({ title: x.title, done: x.progress_done, of: x.progress_of, from: x.name ?? "a platform" })),
      journey: journey.slice(-8),
    };
  });
}

export async function goalsOf(personId: string) {
  return asPerson(personId, async (c) => {
    const r = await c.query<{ id: string; title: string; target_hijri: string | null; status: string; continue_in: string | null; name: string | null; website: string | null }>(
      `select g.id, g.title, g.target_hijri, g.status, g.continue_in, cl.name, cl.website
         from goals g left join clients cl on cl.client_id = g.continue_in
        order by g.status = 'active' desc, g.created_at desc`,
    );
    return r.rows;
  });
}

export async function settingsOf(personId: string) {
  return asPerson(personId, async (c) => (await c.query("select * from settings")).rows[0] ?? null);
}

export async function namesOf(personId: string) {
  return asPerson(personId, async (c) => (await c.query<{ name: string; valid_from: Date; valid_to: Date | null }>(
    "select name, valid_from, valid_to from given_names order by valid_from desc",
  )).rows);
}

/** The next twelve Hijri months, for "By when". */
export function comingHijriMonths(now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let d = new Date(now); out.length < 12; d = new Date(d.getTime() + 86_400_000)) {
    const l = hijriMonth(d);
    if (!out.includes(l)) out.push(l);
  }
  return out;
}
