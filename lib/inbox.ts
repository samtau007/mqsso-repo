import { audit } from "./audit";
import { decrypt, encrypt } from "./crypto";
import { one, query } from "./db";

// The inbox, for people who joined with no email. Mail that platforms send to their relay
// address waits here instead of being forwarded. Sender, subject and text are sealed together;
// nothing else is kept: no images, no attachments, no links followed. Messages go after 30 days.

export const INBOX_DAYS = 30;
const MAX_TEXT = 20_000;

export type Message = { from: string; fromEmail: string | null; subject: string; text: string };

/** HTML to plain text, so no image or script from a sender ever loads on the dashboard. */
export function plainText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label} (${href})`)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function keepInInbox(personId: string, clientId: string, m: Message) {
  const sealed = encrypt(JSON.stringify({ ...m, text: m.text.slice(0, MAX_TEXT) }));
  await query("insert into inbox_messages (person_id, client_id, sealed) values ($1, $2, $3)", [personId, clientId, sealed]);
}

export type InboxItem = { id: string; platform: string; from: string; subject: string; receivedAt: Date; read: boolean };

export async function inboxList(personId: string): Promise<InboxItem[]> {
  const r = await query<{ id: string; sealed: string; received_at: Date; read_at: Date | null; name: string | null }>(
    `select m.id, m.sealed, m.received_at, m.read_at, cl.name from inbox_messages m left join clients cl on cl.client_id = m.client_id
      where m.person_id = $1 and m.expires_at > now() order by m.received_at desc limit 200`,
    [personId],
  );
  return r.rows.map((x) => {
    const m = JSON.parse(decrypt(x.sealed)) as Message;
    return { id: x.id, platform: x.name ?? "A platform", from: m.from, subject: m.subject, receivedAt: x.received_at, read: !!x.read_at };
  });
}

export async function inboxUnread(personId: string): Promise<number> {
  const r = await one<{ n: string }>("select count(*) as n from inbox_messages where person_id = $1 and read_at is null and expires_at > now()", [personId]);
  return Number(r?.n ?? 0);
}

export async function inboxOpen(personId: string, id: string) {
  const r = await one<{ sealed: string; received_at: Date; expires_at: Date; name: string | null }>(
    `update inbox_messages m set read_at = coalesce(read_at, now()) from (select 1) x
      where m.id = $2 and m.person_id = $1 and m.expires_at > now()
      returning m.sealed, m.received_at, m.expires_at, (select name from clients where client_id = m.client_id) as name`,
    [personId, id],
  );
  if (!r) return null;
  return { ...(JSON.parse(decrypt(r.sealed)) as Message), platform: r.name ?? "A platform", receivedAt: r.received_at, expiresAt: r.expires_at };
}

export async function inboxDelete(personId: string, id: string) {
  await query("delete from inbox_messages where id = $2 and person_id = $1", [personId, id]);
}

/** Run from the daily job. */
export async function sweepInbox(): Promise<number> {
  const r = await query("delete from inbox_messages where expires_at < now()");
  if (r.rowCount) await audit({ actor: "system", action: "inbox.swept", detail: { removed: r.rowCount } });
  return r.rowCount ?? 0;
}

/** The text of a message without marking it read (for Export my record). */
export async function inboxRead(personId: string, id: string): Promise<{ fromEmail: string | null; text: string } | null> {
  const r = await one<{ sealed: string }>("select sealed from inbox_messages where id = $2 and person_id = $1", [personId, id]);
  if (!r) return null;
  const m = JSON.parse(decrypt(r.sealed)) as Message;
  return { fromEmail: m.fromEmail, text: m.text };
}
