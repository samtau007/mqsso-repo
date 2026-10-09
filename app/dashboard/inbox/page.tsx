import { redirect } from "next/navigation";
import { INBOX_DAYS, inboxList } from "@/lib/inbox";
import { hasEmail } from "@/lib/people";
import { currentPersonId } from "@/lib/site/session";
import { ago } from "../parts";

/** Inbox: mail from platforms to the private addresses of someone who joined with no email. */
export default async function Inbox() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const [list, withEmail] = await Promise.all([inboxList(personId), hasEmail(personId)]);
  return (
    <>
      <div>
        <h1 className="d-title">Inbox</h1>
        <p className="d-sub">
          {withEmail
            ? "Mail from platforms goes to your own email. This inbox fills only if you have no email with Muslim Quotient."
            : `You joined without an email, so mail that platforms send to your private addresses waits here. Text only, kept for ${INBOX_DAYS} days, seen by no one else.`}
        </p>
      </div>
      <section className="d-card" aria-label="Messages">
        {list.length === 0 && <p className="d-muted">Nothing here.</p>}
        {list.map((m) => (
          <a key={m.id} href={`/dashboard/inbox/${m.id}`} className="d-row-line" style={{ color: "inherit", textDecoration: "none" }} data-testid="inbox-row">
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ color: "#fff", fontWeight: m.read ? 400 : 600 }}>{m.subject}</span>
              <small className="d-hint">{m.from} · {m.platform}</small>
            </span>
            <span>{ago(m.receivedAt)}</span>
          </a>
        ))}
      </section>
    </>
  );
}
