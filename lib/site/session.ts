import { cookies } from "next/headers";
import { decrypt, encrypt } from "../crypto";
import { one } from "../db";
import { env } from "../env";
import { siteClient } from "./oidc";

// The website's own session. It holds the private ID muslimquotient.com received, sealed with
// AES-GCM. On every request the ID is checked against connections, so a disconnected or
// deleted account is signed out at once.

const SESSION = "mq_site";
const PENDING = "mq_site_auth";
const SESSION_DAYS = 14;

const base = () => ({ httpOnly: true, sameSite: "lax" as const, secure: env.siteOrigin.startsWith("https:"), path: "/" });

export type Pending = { verifier: string; state: string; nonce: string };

export function savePending(p: Pending) {
  cookies().set(PENDING, encrypt(JSON.stringify(p), env.sessionKey), { ...base(), maxAge: 10 * 60 });
}

export function takePending(): Pending | null {
  const raw = cookies().get(PENDING)?.value;
  cookies().delete(PENDING);
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw, env.sessionKey)) as Pending;
  } catch {
    return null;
  }
}

export function startSession(sub: string) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  cookies().set(SESSION, encrypt(JSON.stringify({ sub, exp }), env.sessionKey), { ...base(), maxAge: SESSION_DAYS * 24 * 60 * 60 });
}

export function endSession() {
  cookies().delete(SESSION);
}

/** The signed-in person's internal ID, or null. */
export async function currentPersonId(): Promise<string | null> {
  const raw = cookies().get(SESSION)?.value;
  if (!raw) return null;
  let sub: string;
  try {
    const s = JSON.parse(decrypt(raw, env.sessionKey)) as { sub: string; exp: number };
    if (Date.now() > s.exp) return null;
    sub = s.sub;
  } catch {
    return null;
  }
  const r = await one<{ person_id: string }>(
    "select person_id from connections where client_id = $1 and sub = $2 and revoked_at is null",
    [siteClient().clientId, sub],
  );
  return r?.person_id ?? null;
}
