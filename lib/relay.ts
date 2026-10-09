import { timingSafeEqual } from "node:crypto";
import { audit } from "./audit";
import { decrypt } from "./crypto";
import { one, query } from "./db";
import { env } from "./env";

// The email relay. A platform writes to a person's relay address (abc@relay.muslimquotient.com);
// Postmark receives it and posts it here; we forward it to the person's real inbox through
// Postmark. Nothing about the message is stored: only that one was forwarded or dropped.

export function relayEnabled(): boolean {
  return Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.MQ_RELAY_INBOUND_SECRET);
}

/** Postmark calls the inbound address with HTTP Basic credentials we set: relay:<secret>. */
export function inboundAuthorised(header: string | null): boolean {
  const expected = Buffer.from(`Basic ${Buffer.from(`relay:${process.env.MQ_RELAY_INBOUND_SECRET ?? ""}`).toString("base64")}`);
  const given = Buffer.from(header ?? "");
  return !!process.env.MQ_RELAY_INBOUND_SECRET && expected.length === given.length && timingSafeEqual(expected, given);
}

export type Inbound = {
  FromFull?: { Email?: string; Name?: string };
  ToFull?: { Email?: string }[];
  CcFull?: { Email?: string }[];
  OriginalRecipient?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: { Name?: string; Value?: string }[];
  Attachments?: { Name?: string; Content?: string; ContentType?: string; ContentLength?: number }[];
};

const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024;

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

const isSpam = (m: Inbound) => (m.Headers ?? []).some((h) => h.Name?.toLowerCase() === "x-spam-status" && /^yes/i.test(h.Value ?? ""));

export type Outcome = { address: string; result: "forwarded" | "dropped" | "unknown" | "failed"; reason?: string };

/** Forwards one inbound message to every relay address it was sent to. */
export async function relayInbound(m: Inbound): Promise<Outcome[]> {
  const domain = `@${env.relayDomain}`.toLowerCase();
  const addresses = [...new Set(
    [m.OriginalRecipient, ...(m.ToFull ?? []).map((t) => t.Email), ...(m.CcFull ?? []).map((t) => t.Email)]
      .filter((a): a is string => !!a && a.toLowerCase().endsWith(domain))
      .map((a) => a.toLowerCase()),
  )];
  const out: Outcome[] = [];
  for (const address of addresses) {
    const t = await target(address);
    if (!t || !t.emailEnc) {
      out.push({ address, result: "unknown" });
      continue;
    }
    const drop = t.relayOff ? "switched off" : isSpam(m) ? "spam" : null;
    if (drop) {
      await audit({ actor: "relay", action: "relay.dropped", personId: t.personId, clientId: t.clientId, detail: { reason: drop } });
      out.push({ address, result: "dropped", reason: drop });
      continue;
    }
    const ok = await forward(m, t, decrypt(t.emailEnc));
    await audit({ actor: "relay", action: ok ? "relay.forwarded" : "relay.failed", personId: t.personId, clientId: t.clientId });
    out.push({ address, result: ok ? "forwarded" : "failed" });
  }
  return out;
}

async function forward(m: Inbound, t: Target, to: string): Promise<boolean> {
  let size = 0;
  const attachments = (m.Attachments ?? []).filter((a) => {
    size += a.ContentLength ?? Math.ceil(((a.Content ?? "").length * 3) / 4);
    return size <= MAX_ATTACHMENTS_BYTES;
  }).map((a) => ({ Name: a.Name ?? "attachment", Content: a.Content ?? "", ContentType: a.ContentType ?? "application/octet-stream" }));

  const fromName = `${(m.FromFull?.Name || m.FromFull?.Email || t.platform).replace(/["<>]/g, "")} via Muslim Quotient`;
  const res = await fetch(`${process.env.POSTMARK_API_BASE || "https://api.postmarkapp.com"}/email`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-postmark-server-token": process.env.POSTMARK_SERVER_TOKEN!,
    },
    body: JSON.stringify({
      From: `"${fromName}" <${process.env.MQ_RELAY_FROM || `relay@${env.relayDomain}`}>`,
      To: to,
      ReplyTo: m.FromFull?.Email || undefined,
      Subject: m.Subject || `(no subject) from ${t.platform}`,
      TextBody: m.TextBody || undefined,
      HtmlBody: m.HtmlBody || undefined,
      Attachments: attachments.length ? attachments : undefined,
      // CLAUDE.md: no open or click tracking in email, ever.
      TrackOpens: false,
      TrackLinks: "None",
      MessageStream: process.env.POSTMARK_STREAM || "outbound",
      Headers: [{ Name: "X-MQ-Relay-For", Value: t.platform }],
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return !!res?.ok;
}

/** The person switches a platform's relay address on or off. Off: mail to it is dropped. */
export async function setRelayOff(personId: string, clientId: string, off: boolean) {
  await query("update connections set relay_off = $3 where person_id = $1 and client_id = $2 and relay_address is not null", [personId, clientId, off]);
  await audit({ actor: `person:${personId}`, action: off ? "relay.switched_off" : "relay.switched_on", personId, clientId });
}
