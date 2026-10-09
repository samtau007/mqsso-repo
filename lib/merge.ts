import { audit } from "./audit";
import { emailIndex } from "./crypto";
import { one, tx } from "./db";
import { sendNotice } from "./notices";

// Merging two Muslim Quotient accounts (PRD 9): the person signed in keeps their account; the
// other one, whose email they proved with a code, is folded into it and deleted.

export async function personByEmail(email: string): Promise<string | null> {
  const r = await one<{ person_id: string }>("select person_id from email_vault where email_index = $1", [emailIndex(email)]);
  return r?.person_id ?? null;
}

export async function mergePreview(otherId: string) {
  const r = await one<{ given_name: string; platforms: string; entries: string; goals: string }>(
    `select p.given_name,
            (select count(*) from connections where person_id = p.id and revoked_at is null) as platforms,
            (select count(*) from entries where person_id = p.id) as entries,
            (select count(*) from goals where person_id = p.id) as goals
       from people p where p.id = $1`,
    [otherId],
  );
  return r && { givenName: r.given_name, platforms: Number(r.platforms), entries: Number(r.entries), goals: Number(r.goals) };
}

/**
 * Moves everything from `fromId` into `intoId`, then deletes `fromId`:
 * - connections move with the private ID each platform already knows, and so do their sign-ins,
 *   so platforms carry on without the person signing in again. Where both accounts were
 *   connected to the same platform, the other account's connection ends and the platform is
 *   told with connection.revoked.
 * - entries, goals and passkeys move; settings move only if this account has none.
 * - the other account's email, names and recovery codes are deleted with it.
 */
export async function mergeAccounts(intoId: string, fromId: string) {
  if (intoId === fromId) throw new Error("Cannot merge an account into itself");
  const ended = await tx(async (c) => {
    const lock = await c.query("select id from people where id = any($1) for update", [[intoId, fromId]]);
    if (lock.rowCount !== 2) throw new Error("Account not found");

    const clash = await c.query<{ client_id: string; sub: string; revoked_at: Date | null }>(
      `select f.client_id, f.sub, f.revoked_at from connections f
        where f.person_id = $2 and exists (select 1 from connections i where i.person_id = $1 and i.client_id = f.client_id)`,
      [intoId, fromId],
    );
    const clashIds = clash.rows.map((r) => r.client_id);

    // Sign-ins: end the clashing ones, hand the rest to the account that stays.
    const grants = await c.query<{ id: string; client: string }>(
      "select id, payload->>'clientId' as client from oidc_payloads where type = 'Grant' and payload->>'accountId' = $1",
      [fromId],
    );
    const endGrants = grants.rows.filter((g) => clashIds.includes(g.client)).map((g) => g.id);
    if (endGrants.length) {
      await c.query("delete from oidc_payloads where grant_id = any($1)", [endGrants]);
      await c.query("delete from oidc_payloads where type = 'Grant' and id = any($1)", [endGrants]);
    }
    await c.query(
      `update oidc_payloads set payload = jsonb_set(payload, '{accountId}', to_jsonb($1::text))
        where payload->>'accountId' = $2 and type in ('Grant', 'AccessToken', 'RefreshToken', 'AuthorizationCode')`,
      [intoId, fromId],
    );
    await c.query("delete from oidc_payloads where type = 'Session' and payload->>'accountId' = $1", [fromId]);

    await c.query("delete from connections where person_id = $1 and client_id = any($2)", [fromId, clashIds]);
    await c.query("update connections set person_id = $1 where person_id = $2", [intoId, fromId]);
    await c.query("update entries set person_id = $1 where person_id = $2", [intoId, fromId]);
    await c.query("update goals set person_id = $1 where person_id = $2", [intoId, fromId]);
    await c.query("delete from imports where person_id = $2 and client_id in (select client_id from imports where person_id = $1)", [intoId, fromId]);
    await c.query("update imports set person_id = $1 where person_id = $2", [intoId, fromId]);
    await c.query("update passkeys set person_id = $1 where person_id = $2", [intoId, fromId]);
    await c.query(
      "update settings set person_id = $1 where person_id = $2 and not exists (select 1 from settings where person_id = $1)",
      [intoId, fromId],
    );
    await c.query("delete from people where id = $1", [fromId]);
    await audit({ actor: `person:${intoId}`, action: "person.merged", personId: intoId, detail: { from: fromId, ended: clashIds.length } }, c);
    return clash.rows.filter((r) => !r.revoked_at);
  });
  for (const e of ended) await sendNotice({ clientId: e.client_id, event: "connection.revoked", sub: e.sub, personId: intoId });
}
