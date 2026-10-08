import { audit } from "./audit";
import { decrypt, emailIndex, encrypt, normaliseEmail } from "./crypto";
import { one, query, tx } from "./db";
import { newGivenName, nextChange } from "./names";

export type Person = { id: string; givenName: string; createdAt: Date; nameChangesOn: Date };

type Row = { id: string; given_name: string; created_at: Date; name_changes_on: Date };
const toPerson = (r: Row): Person => ({ id: r.id, givenName: r.given_name, createdAt: r.created_at, nameChangesOn: r.name_changes_on });

export async function getPerson(id: string): Promise<Person | undefined> {
  const r = await one<Row>("select id, given_name, created_at, name_changes_on from people where id = $1", [id]);
  return r && toPerson(r);
}

/** Finds the person who owns this email, or creates them with a new given name. */
export async function findOrCreatePerson(email: string): Promise<{ person: Person; created: boolean }> {
  const index = emailIndex(email);
  const existing = await one<Row>(
    "select p.id, p.given_name, p.created_at, p.name_changes_on from people p join email_vault v on v.person_id = p.id where v.email_index = $1",
    [index],
  );
  if (existing) return { person: toPerson(existing), created: false };

  return tx(async (c) => {
    const name = newGivenName();
    const changes = nextChange();
    const p = (await c.query<Row>(
      "insert into people (given_name, name_changes_on) values ($1, $2) returning id, given_name, created_at, name_changes_on",
      [name, changes],
    )).rows[0];
    const inserted = await c.query(
      "insert into email_vault (person_id, email_ciphertext, email_index) values ($1, $2, $3) on conflict (email_index) do nothing",
      [p.id, encrypt(normaliseEmail(email)), index],
    );
    if (inserted.rowCount === 0) {
      // Someone else signed up with this email at the same moment. Use theirs.
      throw new RetrySignUp();
    }
    await c.query("insert into given_names (person_id, name, valid_from) values ($1, $2, $3)", [p.id, name, p.created_at]);
    await audit({ actor: `person:${p.id}`, action: "person.created", personId: p.id }, c);
    return { person: toPerson(p), created: true };
  }).catch(async (e) => {
    if (e instanceof RetrySignUp) return findOrCreatePerson(email);
    throw e;
  });
}

class RetrySignUp extends Error {}

/** The person's real email. Only the sign-in and relay services call this. */
export async function realEmail(personId: string): Promise<string | undefined> {
  const r = await one<{ email_ciphertext: string }>("select email_ciphertext from email_vault where person_id = $1", [personId]);
  return r && decrypt(r.email_ciphertext);
}

/** Gives a new given name to everyone whose 30 days are up. Safe to run as often as wanted. */
export async function rotateDueNames(now: Date = new Date()): Promise<number> {
  const due = await query<{ id: string; given_name: string }>(
    "select id, given_name from people where name_changes_on <= $1 order by name_changes_on limit 1000",
    [now],
  );
  for (const p of due.rows) {
    await tx(async (c) => {
      const locked = await c.query<{ given_name: string }>(
        "select given_name from people where id = $1 and name_changes_on <= $2 for update skip locked",
        [p.id, now],
      );
      if (!locked.rowCount) return;
      const name = newGivenName(locked.rows[0].given_name);
      await c.query("update given_names set valid_to = $2 where person_id = $1 and valid_to is null", [p.id, now]);
      await c.query("insert into given_names (person_id, name, valid_from) values ($1, $2, $3)", [p.id, name, now]);
      await c.query("update people set given_name = $2, name_changes_on = $3 where id = $1", [p.id, name, nextChange(now)]);
    });
  }
  return due.rowCount ?? 0;
}
