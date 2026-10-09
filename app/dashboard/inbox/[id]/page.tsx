import { notFound, redirect } from "next/navigation";
import { inboxOpen } from "@/lib/inbox";
import { currentPersonId } from "@/lib/site/session";
import { removeMessage } from "../../actions";
import { ago } from "../../parts";

/** One message, as plain text. Nothing in it is loaded from anywhere. */
export default async function MessagePage({ params }: { params: { id: string } }) {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const m = await inboxOpen(personId, params.id);
  if (!m) notFound();
  const days = Math.max(0, Math.ceil((m.expiresAt.getTime() - Date.now()) / 86_400_000));
  return (
    <>
      <a className="d-link" href="/dashboard/inbox" style={{ textDecoration: "none" }}>‹ Inbox</a>
      <div>
        <h1 className="d-title" style={{ fontSize: 24 }}>{m.subject}</h1>
        <p className="d-sub">From {m.from}{m.fromEmail && m.fromEmail !== m.from ? ` (${m.fromEmail})` : ""}, through {m.platform} · {ago(m.receivedAt)}</p>
      </div>
      <section className="d-card">
        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 15, lineHeight: 1.6 }}>{m.text || "(This message had no text.)"}</div>
      </section>
      <form action={removeMessage} className="d-steps" style={{ alignItems: "center" }}>
        <input type="hidden" name="message" value={params.id} />
        <button className="d-btn line" type="submit">Delete</button>
        <span className="d-hint">Deleted by itself in {days} {days === 1 ? "day" : "days"}.</span>
      </form>
    </>
  );
}
