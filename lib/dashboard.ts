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
  platforms: { clientId: string; name: string; website: string; scopes: string[]; connectedAt: Date }[];
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
       from entries where occurred_at >= $1`,
      [monthStart],
    )).rows[0];

    const ranges = await c.query<{ title: string; range_low: string; range_high: string; range_of: string; name: string | null; occurred_at: Date }>(
      `select distinct on (e.title) e.title, e.range_low, e.range_high, e.range_of, cl.name, e.occurred_at
         from entries e left join clients cl on cl.client_id = e.client_id
        where e.type = 'reflection'
        order by e.title, e.occurred_at desc`,
    );

    const platforms = await c.query<{ client_id: string; name: string | null; website: string | null; scopes: string[]; connected_at: Date }>(
      `select c.client_id, cl.name, cl.website, c.scopes, c.connected_at
         from connections c left join clients cl on cl.client_id = c.client_id
        where c.revoked_at is null and c.client_id <> $1
        order by c.connected_at`,
      [siteClientId],
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
        clientId: r.client_id, name: r.name ?? "A platform", website: r.website ?? "", scopes: r.scopes, connectedAt: r.connected_at,
      })),
    };
  });
}
