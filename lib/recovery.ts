import { createHmac, randomInt } from "node:crypto";
import { audit } from "./audit";
import { emailIndex } from "./crypto";
import { one, query, tx } from "./db";
import { env } from "./env";

// Printable recovery codes, for someone who loses the mailbox they signed up with (for example
// after hiding their email everywhere). Ten at a time, each good once, stored only as a keyed hash.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const RECOVERY_COUNT = 10;
const FAILS_PER_HOUR = 5;
const GLOBAL_FAILS_PER_MINUTE = 30;

function hash(code: string) {
  return createHmac("sha256", env.indexKey).update(`recovery:${code.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`).digest("hex");
}

export function newCode(): string {
  const c = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}

/** Makes ten new codes and retires any earlier ones. The codes are shown once and never stored. */
export async function makeRecoveryCodes(personId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_COUNT }, newCode);
  await tx(async (c) => {
    await c.query("delete from recovery_codes where person_id = $1", [personId]);
    for (const code of codes) await c.query("insert into recovery_codes (person_id, code_hash) values ($1, $2)", [personId, hash(code)]);
  });
  await audit({ actor: `person:${personId}`, action: "recovery.made", personId });
  return codes;
}

export class RecoveryError extends Error {}

/**
 * Signs in with a recovery code, and the sign-up email if the person gave one. People who joined
 * with no email use the code alone: ten characters from 31 make guessing one hopeless, and failed
 * tries are limited across everyone. The code is spent.
 */
export async function useRecoveryCode(email: string, code: string): Promise<string> {
  const wrong = new RecoveryError(email.trim() ? "That email and code do not match." : "That code does not match.");
  let personId: string | null = null;
  if (email.trim()) {
    const person = await one<{ person_id: string }>("select person_id from email_vault where email_index = $1", [emailIndex(email)]);
    if (!person) throw wrong;
    personId = person.person_id;
    const fails = await one<{ n: string }>(
      "select count(*) as n from audit_log where person_id = $1 and action = 'recovery.failed' and at > now() - interval '1 hour'",
      [personId],
    );
    if (Number(fails!.n) >= FAILS_PER_HOUR) throw new RecoveryError("Too many tries. Wait an hour and try again.");
  } else {
    const fails = await one<{ n: string }>(
      "select count(*) as n from audit_log where action = 'recovery.failed' and at > now() - interval '1 minute'",
    );
    if (Number(fails!.n) >= GLOBAL_FAILS_PER_MINUTE) throw new RecoveryError("Too many tries just now. Wait a minute and try again.");
  }
  const used = await one<{ person_id: string }>(
    `update recovery_codes set used_at = now() where code_hash = $1 and used_at is null ${personId ? "and person_id = $2" : ""} returning person_id`,
    personId ? [hash(code), personId] : [hash(code)],
  );
  if (!used) {
    await audit({ actor: "anonymous", action: "recovery.failed", personId });
    throw wrong;
  }
  await audit({ actor: `person:${used.person_id}`, action: "recovery.used", personId: used.person_id });
  return used.person_id;
}

export async function recoveryLeft(personId: string): Promise<number> {
  const r = await one<{ n: string }>("select count(*) as n from recovery_codes where person_id = $1 and used_at is null", [personId]);
  return Number(r!.n);
}
