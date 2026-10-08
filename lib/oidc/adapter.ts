import type { Adapter, AdapterPayload } from "oidc-provider";
import { query } from "../db";
import { oidcClientMetadata } from "../clients";

/**
 * node-oidc-provider storage in Postgres (table oidc_payloads). Clients are read from the
 * clients table, which the developer portal writes; the provider never writes clients.
 */
export class PostgresAdapter implements Adapter {
  constructor(private type: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
    if (this.type === "Client") throw new Error("Clients are registered through the developer portal");
    await query(
      `insert into oidc_payloads (id, type, payload, grant_id, user_code, uid, expires_at)
       values ($1, $2, $3, $4, $5, $6, case when $7::int > 0 then now() + make_interval(secs => $7::int) end)
       on conflict (id, type) do update set
         payload = excluded.payload, grant_id = excluded.grant_id, user_code = excluded.user_code,
         uid = excluded.uid, expires_at = excluded.expires_at`,
      [id, this.type, payload, payload.grantId ?? null, payload.userCode ?? null, payload.uid ?? null, expiresIn ?? 0],
    );
  }

  private async findBy(column: "id" | "uid" | "user_code", value: string): Promise<AdapterPayload | undefined> {
    const r = await query<{ payload: AdapterPayload; consumed_at: Date | null }>(
      `select payload, consumed_at from oidc_payloads
        where type = $1 and ${column} = $2 and (expires_at is null or expires_at > now())`,
      [this.type, value],
    );
    const row = r.rows[0];
    if (!row) return undefined;
    return row.consumed_at ? { ...row.payload, consumed: Math.floor(row.consumed_at.getTime() / 1000) } : row.payload;
  }

  async find(id: string) {
    if (this.type === "Client") return (await oidcClientMetadata(id)) as AdapterPayload | undefined;
    return this.findBy("id", id);
  }

  async findByUid(uid: string) {
    return this.findBy("uid", uid);
  }

  async findByUserCode(userCode: string) {
    return this.findBy("user_code", userCode);
  }

  async consume(id: string) {
    await query("update oidc_payloads set consumed_at = now() where id = $1 and type = $2", [id, this.type]);
  }

  async destroy(id: string) {
    await query("delete from oidc_payloads where id = $1 and type = $2", [id, this.type]);
  }

  async revokeByGrantId(grantId: string) {
    await query("delete from oidc_payloads where grant_id = $1", [grantId]);
  }
}

/** Removes expired rows. Run from the scheduled job. */
export async function sweepExpired(): Promise<number> {
  const r = await query("delete from oidc_payloads where expires_at < now() - interval '1 day'");
  return r.rowCount ?? 0;
}
