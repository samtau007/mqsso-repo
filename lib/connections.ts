import { createHmac } from "node:crypto";
import { audit } from "./audit";
import { token } from "./crypto";
import { one, query } from "./db";
import { env } from "./env";

export type EmailChoice = "share" | "hide";

/**
 * The private ID a platform sees for a person. The same within one sector group (our three
 * products share one), different in every other group, and not reversible without the salt.
 */
export function pairwiseSub(sectorGroup: string, personId: string, salt: string = env.pairwiseSalt): string {
  const h = createHmac("sha256", salt).update(`${sectorGroup}:${personId}`).digest("hex");
  return `mq_${h.slice(0, 30)}`;
}

export type Connection = {
  personId: string;
  clientId: string;
  sub: string;
  scopes: string[];
  emailChoice: EmailChoice | null;
  relayAddress: string | null;
};

type Row = { person_id: string; client_id: string; sub: string; scopes: string[]; email_choice: EmailChoice | null; relay_address: string | null };
const toConnection = (r: Row): Connection => ({
  personId: r.person_id, clientId: r.client_id, sub: r.sub, scopes: r.scopes, emailChoice: r.email_choice, relayAddress: r.relay_address,
});

export async function getConnection(personId: string, clientId: string): Promise<Connection | undefined> {
  const r = await one<Row>(
    "select person_id, client_id, sub, scopes, email_choice, relay_address from connections where person_id = $1 and client_id = $2 and revoked_at is null",
    [personId, clientId],
  );
  return r && toConnection(r);
}

/** Whether the person has ever connected any platform. The first permission screen introduces their given name. */
export async function hasConnections(personId: string): Promise<boolean> {
  return !!(await one("select 1 from connections where person_id = $1 limit 1", [personId]));
}

function newRelayAddress() {
  return `${token(10)}@${env.relayDomain}`;
}

/**
 * Saves what the person allowed for a platform. A relay address is made the first time the
 * person chooses "Hide my email" for that platform, and kept from then on.
 */
export async function saveConnection(c: { personId: string; clientId: string; sub: string; scopes: string[]; emailChoice: EmailChoice | null }): Promise<Connection> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await one<Row>(
        `insert into connections (person_id, client_id, sub, scopes, email_choice, relay_address)
         values ($1, $2, $3, $4, $5, case when $5 = 'hide' then $6 else null end)
         on conflict (person_id, client_id) do update set
           sub = excluded.sub,
           scopes = excluded.scopes,
           email_choice = coalesce(excluded.email_choice, connections.email_choice),
           relay_address = case
             when coalesce(excluded.email_choice, connections.email_choice) = 'hide'
               then coalesce(connections.relay_address, $6)
             else connections.relay_address end,
           revoked_at = null,
           connected_at = case when connections.revoked_at is null then connections.connected_at else now() end
         returning person_id, client_id, sub, scopes, email_choice, relay_address`,
        [c.personId, c.clientId, c.sub, c.scopes, c.emailChoice, newRelayAddress()],
      );
      await audit({ actor: `person:${c.personId}`, action: "connection.saved", personId: c.personId, clientId: c.clientId, detail: { scopes: c.scopes } });
      return toConnection(r!);
    } catch (e) {
      // A new relay address collided with an existing one. Try another.
      if ((e as { code?: string }).code === "23505" && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error("unreachable");
}
