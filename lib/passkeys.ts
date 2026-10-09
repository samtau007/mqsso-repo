import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { one, query } from "./db";
import { env } from "./env";
import { createPersonWithoutEmail } from "./people";

// Passkeys (WebAuthn). One relying party for the whole of Muslim Quotient, so a passkey made on
// the dashboard (www.) works on the sign-in pages (id.) and the other way round.

const CHALLENGE_MINUTES = 10;

/** muslimquotient.com: the website's host without www. MQ_RP_ID overrides it. In development use hosts under one name, like www.mq.localhost and id.mq.localhost: browsers do not share a passkey across bare *.localhost. */
export function rpId(): string {
  return process.env.MQ_RP_ID || new URL(env.siteOrigin).hostname.replace(/^www\./, "");
}
const origins = () => [env.idOrigin, env.siteOrigin];

async function putChallenge(key: string, challenge: string | null, personId: string | null, newPersonId: string | null = null) {
  await query(
    `insert into webauthn_challenges (id, challenge, person_id, new_person_id, expires_at) values ($1, $2, $3, $5, now() + make_interval(mins => $4))
     on conflict (id) do update set challenge = excluded.challenge, person_id = coalesce(excluded.person_id, webauthn_challenges.person_id),
       new_person_id = excluded.new_person_id, expires_at = excluded.expires_at`,
    [key, challenge, personId, CHALLENGE_MINUTES, newPersonId],
  );
}

/** Reads and removes a challenge or offer. Each is good once. */
export async function takeChallenge(key: string): Promise<{ challenge: string | null; personId: string | null } | null> {
  const r = await one<{ challenge: string | null; person_id: string | null }>(
    "delete from webauthn_challenges where id = $1 and expires_at > now() returning challenge, person_id",
    [key],
  );
  return r ? { challenge: r.challenge, personId: r.person_id } : null;
}

export async function peekChallenge(key: string) {
  return one<{ challenge: string | null; person_id: string | null }>(
    "select challenge, person_id from webauthn_challenges where id = $1 and expires_at > now()",
    [key],
  );
}

/** After an email code: remembers, for this sign-in only, who may add a passkey or carry on. */
export async function offer(key: string, personId: string) {
  await putChallenge(key, null, personId);
  await query("update people set passkey_offered_at = now() where id = $1", [personId]);
}

/** Offer once after the first sign-in by code, and again a month later while there is none. */
export async function shouldOffer(personId: string): Promise<boolean> {
  const r = await one<{ has: boolean; offered: Date | null }>(
    "select exists (select 1 from passkeys where person_id = $1) as has, (select passkey_offered_at from people where id = $1) as offered",
    [personId],
  );
  return !!r && !r.has && (!r.offered || Date.now() - r.offered.getTime() > 30 * 86_400_000);
}

export async function registrationOptions(key: string, personId: string, isNew = false) {
  const existing = isNew
    ? { rows: [] as { id: string; transports: string[] }[] }
    : await query<{ id: string; transports: string[] }>("select id, transports from passkeys where person_id = $1", [personId]);
  const options = await generateRegistrationOptions({
    rpName: "Muslim Quotient",
    rpID: rpId(),
    // The passkey manager shows this. Never a real name, and not the given name, which changes.
    userName: "Muslim Quotient ID",
    userDisplayName: "Muslim Quotient ID",
    userID: new TextEncoder().encode(personId),
    attestationType: "none",
    excludeCredentials: existing.rows.map((c) => ({ id: c.id, transports: c.transports as AuthenticatorTransport[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  if (isNew) await putChallenge(key, options.challenge, null, personId);
  else await putChallenge(key, options.challenge, personId);
  return options;
}

/** Joining with no email: the new person's ID is chosen now and carried by the passkey. */
export async function newAccountOptions(key: string) {
  return registrationOptions(key, randomUUID(), true);
}

/** Makes the passkey and, with it, the person. Returns the new person's ID. */
export async function finishNewAccount(key: string, response: RegistrationResponseJSON, userAgent?: string): Promise<string | null> {
  const c = await one<{ challenge: string | null; new_person_id: string | null }>(
    "delete from webauthn_challenges where id = $1 and expires_at > now() returning challenge, new_person_id",
    [key],
  );
  if (!c?.challenge || !c.new_person_id) return null;
  const v = await verifyRegistrationResponse({
    response, expectedChallenge: c.challenge, expectedOrigin: origins(), expectedRPID: rpId(), requireUserVerification: false,
  }).catch(() => null);
  if (!v?.verified || !v.registrationInfo) return null;
  const person = await createPersonWithoutEmail(c.new_person_id);
  const cred = v.registrationInfo.credential;
  await query(
    "insert into passkeys (id, person_id, public_key, counter, transports, name) values ($1, $2, $3, $4, $5, $6)",
    [cred.id, person.id, Buffer.from(cred.publicKey), cred.counter, cred.transports ?? [], deviceName(userAgent)],
  );
  await audit({ actor: `person:${person.id}`, action: "passkey.added", personId: person.id });
  return person.id;
}

type AuthenticatorTransport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

function deviceName(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "This device";
  return `${os} passkey`;
}

export async function finishRegistration(key: string, response: RegistrationResponseJSON, userAgent?: string): Promise<string | null> {
  const c = await takeChallenge(key);
  if (!c?.challenge || !c.personId) return null;
  const v = await verifyRegistrationResponse({
    response, expectedChallenge: c.challenge, expectedOrigin: origins(), expectedRPID: rpId(), requireUserVerification: false,
  }).catch(() => null);
  if (!v?.verified || !v.registrationInfo) return null;
  const cred = v.registrationInfo.credential;
  await query(
    "insert into passkeys (id, person_id, public_key, counter, transports, name) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing",
    [cred.id, c.personId, Buffer.from(cred.publicKey), cred.counter, cred.transports ?? [], deviceName(userAgent)],
  );
  await audit({ actor: `person:${c.personId}`, action: "passkey.added", personId: c.personId });
  return c.personId;
}

/** Usernameless: the browser offers whichever passkey it holds for Muslim Quotient. */
export async function authenticationOptions(key: string) {
  const options = await generateAuthenticationOptions({ rpID: rpId(), userVerification: "preferred", allowCredentials: [] });
  await putChallenge(key, options.challenge, null);
  return options;
}

/** The person the passkey belongs to, or null. */
export async function finishAuthentication(key: string, response: AuthenticationResponseJSON): Promise<string | null> {
  const c = await takeChallenge(key);
  if (!c?.challenge) return null;
  const pk = await one<{ id: string; person_id: string; public_key: Buffer; counter: string; transports: string[] }>(
    "select id, person_id, public_key, counter, transports from passkeys where id = $1",
    [response.id],
  );
  if (!pk) return null;
  const v = await verifyAuthenticationResponse({
    response, expectedChallenge: c.challenge, expectedOrigin: origins(), expectedRPID: rpId(), requireUserVerification: false,
    credential: { id: pk.id, publicKey: new Uint8Array(pk.public_key), counter: Number(pk.counter), transports: pk.transports as AuthenticatorTransport[] },
  }).catch(() => null);
  if (!v?.verified) return null;
  await query("update passkeys set counter = $2, last_used_at = now() where id = $1", [pk.id, v.authenticationInfo.newCounter]);
  await audit({ actor: `person:${pk.person_id}`, action: "passkey.used", personId: pk.person_id });
  return pk.person_id;
}

export async function removePasskey(personId: string, id: string) {
  const r = await query("delete from passkeys where id = $1 and person_id = $2", [id, personId]);
  if (r.rowCount) await audit({ actor: `person:${personId}`, action: "passkey.removed", personId });
}
