import type { PoolClient } from "pg";
import { query } from "./db";

export type AuditEvent = {
  actor: string;
  action: string;
  personId?: string | null;
  clientId?: string | null;
  detail?: Record<string, unknown>;
};

/** Who did what and when. Never pass content, codes, secrets or email addresses. */
export async function audit(e: AuditEvent, c?: PoolClient) {
  const sql = "insert into audit_log (actor, action, person_id, client_id, detail) values ($1, $2, $3, $4, $5)";
  const values = [e.actor, e.action, e.personId ?? null, e.clientId ?? null, JSON.stringify(e.detail ?? {})];
  if (c) await c.query(sql, values);
  else await query(sql, values);
}
