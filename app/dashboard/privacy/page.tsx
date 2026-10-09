import { redirect } from "next/navigation";
import { NAME_DAYS } from "@/lib/names";
import { getPerson } from "@/lib/people";
import { namesOf, platformCards } from "@/lib/dashboard";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { emailChoice } from "../actions";
import { DeleteForm } from "../Forms";

/** Privacy, as in docs/design/Privacy.html: the given name, email per platform, relays, export, delete. */
export default async function Privacy() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const [person, names, platforms] = await Promise.all([getPerson(personId), namesOf(personId), platformCards(personId, siteClient().clientId)]);
  if (!person) redirect("/signin");
  const days = Math.min(NAME_DAYS, Math.max(0, Math.ceil((person.nameChangesOn.getTime() - Date.now()) / 86_400_000)));
  const withEmail = platforms.filter((p) => p.scopes.includes("email"));
  const relays = withEmail.filter((p) => p.relayAddress);

  return (
    <>
      <div>
        <h1 className="d-title">Private by design</h1>
        <p className="d-sub">Your record is between you and your Lord. These protections keep it that way and keep showing off (riyāʾ) out of it.</p>
      </div>

      <section className="d-namecard" aria-labelledby="name">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><span className="d-label" id="name">Your name here</span><b style={{ fontSize: 13 }}>changes in {days} {days === 1 ? "day" : "days"}</b></div>
        <h2>{person.givenName}</h2>
        <p>Given to you, never chosen. A new name every 30 days, so no one can build a reputation on it, including you.</p>
        {names.length > 1 && <div className="d-past">{names.slice(1, 6).map((n) => <span key={n.valid_from.toISOString()}>{n.name}</span>)}</div>}
      </section>

      <section className="d-card" aria-labelledby="emails">
        <span className="d-label" id="emails">Email each platform sees</span>
        {withEmail.length === 0 && <p className="d-muted">No platform has your email.</p>}
        {withEmail.map((p) => (
          <form action={emailChoice} className="d-row-line" key={p.clientId} style={{ alignItems: "center" }}>
            <input type="hidden" name="client_id" value={p.clientId} />
            <span style={{ color: "#fff" }}>{p.name}</span>
            <span className="d-choice">
              <button className={p.emailChoice === "hide" ? "on" : undefined} name="choice" value="hide" type="submit" aria-pressed={p.emailChoice === "hide"}>Hidden</button>
              <button className={p.emailChoice === "share" ? "on" : undefined} name="choice" value="share" type="submit" aria-pressed={p.emailChoice === "share"}>Real email</button>
            </span>
          </form>
        ))}
      </section>

      {relays.length > 0 && (
        <section className="d-card" aria-labelledby="relays">
          <span className="d-label" id="relays">Your relay addresses</span>
          {relays.map((p) => <div className="d-row-line" key={p.clientId}><span>{p.name}</span><span style={{ overflowWrap: "anywhere" }}>{p.relayAddress}</span></div>)}
          <p className="d-hint" style={{ margin: 0 }}>Mail to these reaches your real inbox. Each platform has its own.</p>
        </section>
      )}

      <section className="d-card" aria-labelledby="always">
        <span className="d-label" id="always">Always on</span>
        <div className="d-row-line"><span>Ranges hidden until you press and hold</span><span>On</span></div>
        <div className="d-row-line"><span>Your record blurs when you leave the tab</span><span>On</span></div>
        <div className="d-row-line"><span>Sharing</span><span>There is no share button and no public profile</span></div>
      </section>

      <section className="d-card" aria-labelledby="export">
        <span className="d-label" id="export">Your record, yours to take</span>
        <p className="d-muted">Everything Muslim Quotient holds about you, as one file.</p>
        <div><a className="d-btn line" href="/dashboard/export">Export my record</a></div>
      </section>

      <DeleteForm givenName={person.givenName} />
    </>
  );
}
