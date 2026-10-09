import type { PoolClient } from "pg";
import { audit } from "./audit";
import { one, query, tx } from "./db";
import { provider } from "./oidc/provider";
import { checkEntry, EntryError, SCOPE_FOR, VOCABULARY_VERSION, type Entry } from "./vocabulary";

// The record service at api.muslimquotient.com. A platform sends entries with the access token
// it received at sign-in. The token names the person (internal ID) and the platform; the
// connection says what the person allowed. Entries are write-only for platforms.

export class ApiError extends Error {
  constructor(public status: number, public error: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export type Caller = { personId: string; clientId: string; clientType: "server" | "public"; scopes: Set<string>; connectedAt: Date };

/** Checks the bearer token and the person's current permissions for this platform. */
export async function authenticate(authorization: string | null): Promise<Caller> {
  const m = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i.exec(authorization ?? "");
  if (!m) throw new ApiError(401, "invalid_token", "Send the person's access token as Authorization: Bearer ACCESS_TOKEN.");

  const token = await provider().AccessToken.find(m[1]);
  if (!token || token.isExpired || !token.accountId || !token.clientId) {
    throw new ApiError(401, "invalid_token", "The access token is not valid or has expired. Use the refresh token to get a new one.");
  }

  const row = await one<{ scopes: string[]; connected_at: Date; client_type: "server" | "public"; approved: boolean }>(
    `select c.scopes, c.connected_at, cl.client_type, cl.approved
       from connections c join clients cl on cl.client_id = c.client_id
      where c.person_id = $1 and c.client_id = $2 and c.revoked_at is null`,
    [token.accountId, token.clientId],
  );
  if (!row || !row.approved) throw new ApiError(401, "invalid_token", "This person is not connected to your platform.");

  // What the token carries and what the person allows now: both must hold.
  const tokenScopes = new Set(String(token.scope ?? "").split(" "));
  const scopes = new Set(row.scopes.filter((s) => tokenScopes.has(s)));
  return { personId: token.accountId, clientId: token.clientId, clientType: row.client_type, scopes, connectedAt: row.connected_at };
}

function needsScope(caller: Caller, scope: string, part: string) {
  if (!caller.scopes.has(scope)) throw new ApiError(403, "insufficient_scope", `The person has not allowed your platform to ${part}.`, { scope });
}

/** Entries come from a server. Sending from devices needs attestation, which arrives in phase 2. */
function needsServer(caller: Caller) {
  if (caller.clientType !== "server") {
    throw new ApiError(403, "server_required", "Entries must be sent from your server. Sending from devices is not open yet.");
  }
}

export const PER_MINUTE = 60;
export const IMPORT_MAX = 5000;
export const IMPORT_DAYS = 30;

const PART: Record<Entry["type"], string> = {
  learning: "add to Learning",
  practice: "add to Practice",
  reflection: "add to Reflection",
};

function entryError(e: unknown, index?: number): never {
  if (e instanceof EntryError) {
    throw new ApiError(400, "invalid_entry", index === undefined ? e.message : `Entry ${index}: ${e.message}`, {
      field: e.field, ...(index === undefined ? {} : { index }),
    });
  }
  throw e;
}

async function insertEntry(c: PoolClient, personId: string, clientId: string, e: Entry, importId: string | null) {
  return c.query<{ id: string }>(
    `insert into entries (person_id, client_id, type, action, title, progress_done, progress_of, unit, amount,
                          range_low, range_high, range_of, occurred_at, tz, vocabulary_version, key, source, import_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'server', $17)
     on conflict (client_id, key) do nothing
     returning id`,
    [personId, clientId, e.type, e.action, e.title, e.progress?.done ?? null, e.progress?.of ?? null, e.unit ?? null, e.amount ?? null,
      e.range?.low ?? null, e.range?.high ?? null, e.range?.of ?? null, e.occurredAt, e.tz, VOCABULARY_VERSION, e.key, importId],
  );
}

/** POST /v1/record. Returns the entry's id, and whether it is new. */
export async function record(caller: Caller, body: unknown, now: Date = new Date()): Promise<{ id: string; created: boolean }> {
  needsServer(caller);
  let entry: Entry;
  try {
    entry = checkEntry(body, now);
  } catch (e) {
    entryError(e);
  }
  needsScope(caller, SCOPE_FOR[entry.type], PART[entry.type]);

  return tx(async (c) => {
    // One lock per person and platform, so the count below cannot be raced past.
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [`record:${caller.personId}:${caller.clientId}`]);

    const existing = await c.query<{ id: string; person_id: string }>("select id, person_id from entries where client_id = $1 and key = $2", [caller.clientId, entry.key]);
    if (existing.rows[0]) {
      if (existing.rows[0].person_id !== caller.personId) {
        throw new ApiError(409, "key_in_use", "This key is already used for another person's entry. Keys must be unique within your platform.");
      }
      return { id: existing.rows[0].id, created: false };
    }

    const recent = await c.query<{ n: string }>(
      "select count(*) as n from entries where person_id = $1 and client_id = $2 and import_id is null and created_at > now() - interval '1 minute'",
      [caller.personId, caller.clientId],
    );
    if (Number(recent.rows[0].n) >= PER_MINUTE) {
      throw new ApiError(429, "rate_limited", `Up to ${PER_MINUTE} entries a minute per person. Try again in a minute.`, { retry_after: 60 });
    }

    const r = await insertEntry(c, caller.personId, caller.clientId, entry, null);
    if (!r.rows[0]) throw new ApiError(409, "key_in_use", "This key was just used. Send it again to get its id.");
    return { id: r.rows[0].id, created: true };
  });
}

/** POST /v1/record/import. Held until the person approves it on their dashboard. */
export async function requestImport(caller: Caller, body: unknown, now: Date = new Date()): Promise<{ id: string; status: "pending"; entries: number }> {
  needsServer(caller);
  needsScope(caller, "mq.record.import", "bring past activity into their record");

  if (now.getTime() - caller.connectedAt.getTime() > IMPORT_DAYS * 24 * 60 * 60 * 1000) {
    throw new ApiError(403, "import_closed", `History can be imported only within ${IMPORT_DAYS} days of the person connecting.`);
  }
  if (typeof body !== "object" || body === null || !Array.isArray((body as { entries?: unknown }).entries)) {
    throw new ApiError(400, "invalid_request", "Send { vocabulary_version, entries: [...] }.");
  }
  const { vocabulary_version: version, entries: raw } = body as { vocabulary_version?: unknown; entries: unknown[] };
  if (raw.length === 0) throw new ApiError(400, "invalid_request", "entries is empty.");
  if (raw.length > IMPORT_MAX) throw new ApiError(400, "too_many_entries", `Up to ${IMPORT_MAX} entries in one import.`);

  const seen = new Set<string>();
  const checked: Entry[] = [];
  raw.forEach((r, i) => {
    let e: Entry;
    try {
      e = checkEntry(r, now, version);
    } catch (err) {
      entryError(err, i);
    }
    needsScope(caller, SCOPE_FOR[e.type], PART[e.type]);
    // A repeated key within the import is the same entry sent twice: keep the first.
    if (seen.has(e.key)) return;
    seen.add(e.key);
    checked.push(e);
  });

  const r = await one<{ id: string }>(
    `insert into imports (person_id, client_id, entry_count, pending) values ($1, $2, $3, $4)
     on conflict (person_id, client_id) do nothing
     returning id`,
    [caller.personId, caller.clientId, checked.length, JSON.stringify(checked)],
  );
  if (!r) throw new ApiError(409, "already_imported", "History can be imported once per person, and this person's import was already sent.");
  await audit({ actor: `client:${caller.clientId}`, action: "import.requested", personId: caller.personId, clientId: caller.clientId, detail: { entries: checked.length } });
  return { id: r.id, status: "pending", entries: checked.length };
}

/** The person approves or declines an import from their dashboard. */
export async function decideImport(personId: string, importId: string, approve: boolean): Promise<boolean> {
  return tx(async (c) => {
    const imp = await c.query<{ client_id: string; pending: (Omit<Entry, "occurredAt"> & { occurredAt: string })[] }>(
      "select client_id, pending from imports where id = $1 and person_id = $2 and status = 'pending' for update",
      [importId, personId],
    );
    const row = imp.rows[0];
    if (!row) return false;
    let added = 0;
    if (approve) {
      for (const e of row.pending) {
        const r = await insertEntry(c, personId, row.client_id, { ...e, occurredAt: new Date(e.occurredAt) }, importId);
        added += r.rowCount ?? 0;
      }
    }
    await c.query("update imports set status = $2, decided_at = now(), pending = null where id = $1", [importId, approve ? "approved" : "declined"]);
    await audit({ actor: `person:${personId}`, action: approve ? "import.approved" : "import.declined", personId, clientId: row.client_id, detail: { added } }, c);
    return true;
  });
}

type SettingsRow = {
  prayer_city: string | null; prayer_lat: string | null; prayer_lng: string | null; prayer_method: string | null;
  asr_method: string | null; hijri_adjust: number; language: string | null; tz: string | null; updated_at: Date;
};

/** GET /v1/settings. Only the parts the person allowed; null where the person has not set them yet. */
export async function readSettings(caller: Caller) {
  const prayer = caller.scopes.has("mq.settings.prayer");
  const language = caller.scopes.has("mq.settings.language");
  if (!prayer && !language) throw new ApiError(403, "insufficient_scope", "The person has not allowed your platform to use their prayer settings or language.");

  const s = (await query<SettingsRow>("select * from settings where person_id = $1", [caller.personId])).rows[0];
  const out: Record<string, unknown> = {};
  if (prayer) {
    out.prayer = s && s.prayer_method
      ? {
        location: s.prayer_city ? { city: s.prayer_city, lat: s.prayer_lat === null ? null : Number(s.prayer_lat), lng: s.prayer_lng === null ? null : Number(s.prayer_lng) } : null,
        method: s.prayer_method,
        asr: s.asr_method,
        hijri_adjust: s.hijri_adjust,
      }
      : null;
  }
  if (language) out.language = s?.language ?? null;
  out.tz = s?.tz ?? null;
  out.updated_at = s?.updated_at.toISOString() ?? null;
  return out;
}
