import { cookies } from "next/headers";
import { audit } from "./audit";
import { emailIndex, encrypt, hmac, normaliseEmail, safeEqual, secret } from "./crypto";
import { one } from "./db";
import { env } from "./env";

// Developer portal accounts. Separate from people: a developer account is a work contact
// for a platform, not a Muslim Quotient ID.

const SESSION = "mq_dev";
const FLOW = "mq_dev_flow";
const SESSION_DAYS = 7;

export type Developer = { id: string; isAdmin: boolean };

export async function findOrCreateDeveloper(email: string): Promise<string> {
  const index = emailIndex(email);
  const found = await one<{ id: string }>("select id from developer_accounts where email_index = $1", [index]);
  if (found) return found.id;
  const made = await one<{ id: string }>(
    `insert into developer_accounts (email_ciphertext, email_index) values ($1, $2)
     on conflict (email_index) do update set email_index = excluded.email_index returning id`,
    [encrypt(normaliseEmail(email)), index],
  );
  await audit({ actor: `developer:${made!.id}`, action: "developer.created" });
  return made!.id;
}

async function isAdmin(id: string): Promise<boolean> {
  const admins = new Set(env.portalAdmins.map((e) => emailIndex(e)));
  if (!admins.size) return false;
  const r = await one<{ email_index: string }>("select email_index from developer_accounts where id = $1", [id]);
  return !!r && admins.has(r.email_index);
}

const cookieBase = () => ({ httpOnly: true, sameSite: "lax" as const, secure: env.developersOrigin.startsWith("https:"), path: "/" });

export function startSession(developerId: string) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ d: developerId, exp })).toString("base64url");
  cookies().set(SESSION, `${body}.${hmac(env.sessionKey, body)}`, { ...cookieBase(), maxAge: SESSION_DAYS * 24 * 60 * 60 });
  cookies().delete(FLOW);
}

export function endSession() {
  cookies().delete(SESSION);
}

export async function currentDeveloper(): Promise<Developer | null> {
  const raw = cookies().get(SESSION)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig || !safeEqual(hmac(env.sessionKey, body), sig)) return null;
  try {
    const { d, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { d: string; exp: number };
    if (Date.now() > exp) return null;
    const exists = await one("select 1 from developer_accounts where id = $1", [d]);
    if (!exists) return null;
    return { id: d, isAdmin: await isAdmin(d) };
  } catch {
    return null;
  }
}

/** The sign-in flow for this browser, kept in a short-lived cookie while the code is pending. */
export function flowId(create: boolean): string | null {
  const existing = cookies().get(FLOW)?.value;
  if (existing) return existing;
  if (!create) return null;
  const id = `portal_${secret(18)}`;
  cookies().set(FLOW, id, { ...cookieBase(), maxAge: 15 * 60 });
  return id;
}

export function clearFlow() {
  cookies().delete(FLOW);
}
