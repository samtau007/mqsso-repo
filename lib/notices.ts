import { createHmac, timingSafeEqual } from "node:crypto";
import { audit } from "./audit";
import { decrypt } from "./crypto";
import { one, query } from "./db";

// Signed notices to platforms. Source: docs/DEVELOPER_GUIDE.md, "When a person disconnects or
// deletes". Each notice is a POST of JSON to the platform's notice address, signed with the
// platform's notice signing secret, and retried until the platform answers 2xx.

export type NoticeEvent = "connection.revoked" | "account.deleted" | "settings.updated" | "notice.test";

/** Platforms must act within 30 days; past that, delivery stops. */
const GIVE_UP_DAYS = 30;
const TIMEOUT_MS = 10_000;
/** A notice older than this at the platform should be refused, so a captured one cannot be replayed later. */
export const TOLERANCE_SECONDS = 5 * 60;

/**
 * The MQ-Signature header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, keyed with
 * the notice signing secret exactly as shown in the portal.
 */
export function signNotice(body: string, secret: string, t: number = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** What a platform does with the header. Kept here so the guide's example and the tests agree. */
export function verifyNotice(body: string, header: string, secret: string, now: number = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(now - t) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Wait before retry n (1-based): 1, 2, 4 ... minutes, at most a day. */
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1) * 60_000, 24 * 60 * 60_000);
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[.*\])$/i;

/**
 * Notices go only to public https addresses. Development and the end-to-end tests deliver to
 * this machine, so MQ_ALLOW_LOCAL_NOTICES opens that, never in a real deployment.
 */
export function deliverable(address: string): boolean {
  let u: URL;
  try {
    u = new URL(address);
  } catch {
    return false;
  }
  if (process.env.MQ_ALLOW_LOCAL_NOTICES === "1") return u.protocol === "https:" || u.protocol === "http:";
  return u.protocol === "https:" && !PRIVATE_HOST.test(u.hostname);
}

type Row = {
  id: string; client_id: string; event: NoticeEvent; sub: string; at: Date; attempts: number;
  notice_uri: string | null; signing_secret_enc: string | null;
};

/** Sends one notice now. Returns the platform's HTTP status, or null when it could not be reached. */
async function attempt(n: Row): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  if (!n.notice_uri || !n.signing_secret_enc) return { ok: false, status: null, error: "No notice address" };
  if (!deliverable(n.notice_uri)) return { ok: false, status: null, error: "Notice address is not a public https address" };
  const body = JSON.stringify({ id: n.id, event: n.event, sub: n.sub, at: n.at.toISOString().replace(/\.\d{3}Z$/, "Z") });
  try {
    const res = await fetch(n.notice_uri, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "MuslimQuotient-Notices/1",
        "mq-notice-id": n.id,
        "mq-signature": signNotice(body, decrypt(n.signing_secret_enc)),
      },
      body,
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, error: null };
  } catch (e) {
    return { ok: false, status: null, error: (e as Error).name === "TimeoutError" ? "Timed out after 10 seconds" : "Could not connect" };
  }
}

async function deliver(id: string) {
  const n = await one<Row>(
    `select n.id, n.client_id, n.event, n.sub, n.at, n.attempts, c.notice_uri, c.signing_secret_enc
       from notices n join clients c on c.client_id = n.client_id
      where n.id = $1 and n.delivered_at is null and n.gave_up_at is null`,
    [id],
  );
  if (!n) return null;
  const r = await attempt(n);
  const attempts = n.attempts + 1;
  const tooOld = Date.now() - n.at.getTime() > GIVE_UP_DAYS * 24 * 60 * 60_000;
  await query(
    `update notices set attempts = $2, last_status = $3, last_error = $4,
       delivered_at = case when $5 then now() end,
       gave_up_at = case when not $5 and ($6 or event = 'notice.test') then now() end,
       next_attempt_at = now() + make_interval(secs => $7::int / 1000)
     where id = $1`,
    [id, attempts, r.status, r.error, r.ok, tooOld, retryDelayMs(attempts)],
  );
  return r;
}

/**
 * Queues a notice and tries it at once. Never throws for the platform's sake: a platform being
 * down must not stop a person disconnecting or deleting.
 */
export async function sendNotice(n: { clientId: string; event: NoticeEvent; sub: string; personId?: string | null }) {
  const row = await one<{ id: string }>(
    "insert into notices (client_id, event, sub, person_id) values ($1, $2, $3, $4) returning id",
    [n.clientId, n.event, n.sub, n.personId ?? null],
  );
  await audit({ actor: "system", action: `notice.${n.event}`, personId: n.personId ?? null, clientId: n.clientId });
  const result = await deliver(row!.id).catch(() => null);
  // The scheduled job runs once a day, so any sending is also a chance to retry a few that are due.
  await retryDueNotices(5).catch(() => 0);
  return { id: row!.id, result };
}

/** Retries whatever is due. Run from the scheduled job. */
export async function retryDueNotices(limit = 100): Promise<number> {
  const due = await query<{ id: string }>(
    `select id from notices where delivered_at is null and gave_up_at is null and next_attempt_at <= now()
      order by next_attempt_at limit $1`,
    [limit],
  );
  for (const { id } of due.rows) await deliver(id).catch(() => null);
  return due.rows.length;
}

export type NoticeLog = { id: string; event: NoticeEvent; at: Date; attempts: number; delivered: boolean; gaveUp: boolean; status: number | null; error: string | null };

/** The latest notices to one platform, for its page in the portal. */
export async function recentNotices(clientId: string, limit = 10): Promise<NoticeLog[]> {
  const r = await query<{ id: string; event: NoticeEvent; at: Date; attempts: number; delivered_at: Date | null; gave_up_at: Date | null; last_status: number | null; last_error: string | null }>(
    "select id, event, at, attempts, delivered_at, gave_up_at, last_status, last_error from notices where client_id = $1 order by at desc limit $2",
    [clientId, limit],
  );
  return r.rows.map((x) => ({
    id: x.id, event: x.event, at: x.at, attempts: x.attempts, delivered: !!x.delivered_at, gaveUp: !!x.gave_up_at, status: x.last_status, error: x.last_error,
  }));
}
