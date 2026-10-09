import { createHmac, timingSafeEqual } from "node:crypto";
import { audit } from "./audit";
import { decrypt } from "./crypto";
import { one, query } from "./db";
import { env } from "./env";
import { keepInInbox, plainText } from "./inbox";

// The email relay, on Resend. A platform writes to a person's relay address
// (abc@relay.muslimquotient.com); Resend receives it and tells us with a signed email.received
// webhook; we fetch the message from Resend and send it on to the person's real inbox through
// Resend. Nothing about the message is stored: only that one was forwarded, kept or dropped.
// People who joined with no email get it in their Muslim Quotient inbox instead.

export function relayEnabled(): boolean {
  return Boolean(env.resendApiKey && process.env.RESEND_RELAY_WEBHOOK_SECRET);
}

const TOLERANCE_SECONDS = 300;

/**
 * Resend signs webhooks the Svix way: HMAC-SHA256 over `id.timestamp.body` with the
 * base64 key after "whsec_", sent as one or more "v1,<base64>" in svix-signature.
 */
export function webhookVerified(headers: Headers, body: string, now = Date.now()): boolean {
  const secret = process.env.RESEND_RELAY_WEBHOOK_SECRET ?? "";
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((s) => {
    const [version, sig] = s.split(",");
    const given = Buffer.from(sig ?? "", "base64");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The email.received webhook carries only who and what; the message itself is fetched. */
export type Webhook = { type?: string; data?: { email_id?: string; to?: string[]; cc?: string[]; bcc?: string[] } };

type Received = {
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string> | { name?: string; value?: string }[];
};

async function resend(path: string, init: RequestInit = {}) {
  return fetch(`${env.resendApiBase}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.resendApiKey}`, accept: "application/json", "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
}

type Target = { personId: string; clientId: string; platform: string; relayOff: boolean; emailEnc: string | null };

async function target(address: string): Promise<Target | null> {
  const r = await one<{ person_id: string; client_id: string; name: string; relay_off: boolean; email_ciphertext: string | null }>(
    `select c.person_id, c.client_id, cl.name, c.relay_off, v.email_ciphertext
       from connections c join clients cl on cl.client_id = c.client_id
       left join email_vault v on v.person_id = c.person_id
      where lower(c.relay_address) = lower($1)`,
    [address],
  );
  return r ? { personId: r.person_id, clientId: r.client_id, platform: r.name, relayOff: r.relay_off, emailEnc: r.email_ciphertext } : null;
}

/** "Halaqa Notes <hello@halaqa.example>" into its name and address. */
export function parseAddress(raw: string | undefined): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw ?? "");
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: (raw ?? "").trim() };
}

function header(m: Received, name: string): string | undefined {
  const h = m.headers;
  if (!h) return undefined;
  if (Array.isArray(h)) return h.find((x) => x.name?.toLowerCase() === name)?.value;
  return Object.entries(h).find(([k]) => k.toLowerCase() === name)?.[1];
}

const isSpam = (m: Received) => /^yes/i.test(header(m, "x-spam-status") ?? "");

export type Outcome = { address: string; result: "forwarded" | "kept" | "dropped" | "unknown" | "failed"; reason?: string };

/** Handles one email.received webhook: every relay address the message was sent to. */
export async function relayInbound(hook: Webhook): Promise<Outcome[] | null> {
  if (hook.type !== "email.received" || !hook.data?.email_id) return [];
  const res = await resend(`/emails/receiving/${encodeURIComponent(hook.data.email_id)}`);
  if (!res?.ok) return null;
  const m = (await res.json()) as Received;

  const domain = `@${env.relayDomain}`.toLowerCase();
  const addresses = [...new Set(
    [hook.data.to, hook.data.cc, hook.data.bcc, m.to, m.cc, m.bcc].flat()
      .map((a) => parseAddress(a ?? undefined).email.toLowerCase())
      .filter((a) => a.endsWith(domain)),
  )];
  const from = parseAddress(m.from);
  const out: Outcome[] = [];
  for (const address of addresses) {
    const t = await target(address);
    if (!t) {
      out.push({ address, result: "unknown" });
      continue;
    }
    const drop = t.relayOff ? "switched off" : isSpam(m) ? "spam" : null;
    if (drop) {
      await audit({ actor: "relay", action: "relay.dropped", personId: t.personId, clientId: t.clientId, detail: { reason: drop } });
      out.push({ address, result: "dropped", reason: drop });
      continue;
    }
    if (!t.emailEnc) {
      // Joined with no email: the message waits in their Muslim Quotient inbox instead.
      await keepInInbox(t.personId, t.clientId, {
        from: from.name || from.email || t.platform,
        fromEmail: from.email || null,
        subject: m.subject || "(no subject)",
        text: m.text || (m.html ? plainText(m.html) : ""),
      });
      await audit({ actor: "relay", action: "relay.kept", personId: t.personId, clientId: t.clientId });
      out.push({ address, result: "kept" });
      continue;
    }
    const ok = await forward(m, from, t, decrypt(t.emailEnc));
    await audit({ actor: "relay", action: ok ? "relay.forwarded" : "relay.failed", personId: t.personId, clientId: t.clientId });
    out.push({ address, result: ok ? "forwarded" : "failed" });
  }
  return out;
}

/**
 * Sends the message on. Text and HTML only: attachments are not forwarded. Open and click
 * tracking stay off because the sending domain has them switched off in Resend (CLAUDE.md:
 * no open or click tracking in email, ever).
 */
async function forward(m: Received, from: { name: string; email: string }, t: Target, to: string): Promise<boolean> {
  const fromName = `${(from.name || from.email || t.platform).replace(/["<>]/g, "")} via Muslim Quotient`;
  const res = await resend("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: `"${fromName}" <${process.env.MQ_RELAY_FROM || `relay@${env.relayDomain}`}>`,
      to: [to],
      reply_to: from.email ? [from.email] : undefined,
      subject: m.subject || `(no subject) from ${t.platform}`,
      text: m.text || (m.html ? plainText(m.html) : ""),
      html: m.html || undefined,
      headers: { "X-MQ-Relay-For": t.platform },
    }),
  });
  return !!res?.ok;
}

/** The person switches a platform's relay address on or off. Off: mail to it is dropped. */
export async function setRelayOff(personId: string, clientId: string, off: boolean) {
  await query("update connections set relay_off = $3 where person_id = $1 and client_id = $2 and relay_address is not null", [personId, clientId, off]);
  await audit({ actor: `person:${personId}`, action: off ? "relay.switched_off" : "relay.switched_on", personId, clientId });
}
