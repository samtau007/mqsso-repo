import { redirect } from "next/navigation";
import { NAME_DAYS } from "@/lib/names";
import { getPerson, hasEmail } from "@/lib/people";
import { namesOf, platformCards } from "@/lib/dashboard";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { query } from "@/lib/db";
import { recoveryLeft } from "@/lib/recovery";
import { emailChoice, relaySwitch, removeKey } from "../actions";
import { DeleteForm } from "../Forms";
import { ago } from "../parts";
import { AddPasskey, RecoveryCodes } from "../Safety";

/** Privacy, as in docs/design/Privacy.html: the given name, email per platform, relays, export, delete. */
export default async function Privacy() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const [person, names, platforms] = await Promise.all([getPerson(personId), namesOf(personId), platformCards(personId, siteClient().clientId)]);
  if (!person) redirect("/signin");
  const passkeys = (await query<{ id: string; name: string; created_at: Date; last_used_at: Date | null }>(
    "select id, name, created_at, last_used_at from passkeys where person_id = $1 order by created_at",
    [personId],
  )).rows;
  const codesLeft = await recoveryLeft(personId);
  const withEmail = await hasEmail(personId);
  const days = Math.min(NAME_DAYS, Math.max(0, Math.ceil((person.nameChangesOn.getTime() - Date.now()) / 86_400_000)));
  const emailPlatforms = platforms.filter((p) => p.scopes.includes("email"));
  const relays = emailPlatforms.filter((p) => p.relayAddress);

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
        {!withEmail && <p className="d-muted">You joined without an email. Platforms that asked for one have a private address, and their mail waits in your <a className="d-link" href="/dashboard/inbox">Inbox</a>.</p>}
        {withEmail && emailPlatforms.length === 0 && <p className="d-muted">No platform has your email.</p>}
        {withEmail && emailPlatforms.map((p) => (
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
          {relays.map((p) => (
            <form action={relaySwitch} className="d-row-line" key={p.clientId} style={{ alignItems: "center" }}>
              <input type="hidden" name="client_id" value={p.clientId} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={{ color: "#fff" }}>{p.name}</span><small className="d-hint" style={{ overflowWrap: "anywhere" }}>{p.relayAddress}</small></span>
              <span className="d-choice">
                <button className={p.relayOff ? undefined : "on"} name="off" value="no" type="submit" aria-pressed={!p.relayOff}>On</button>
                <button className={p.relayOff ? "on" : undefined} name="off" value="yes" type="submit" aria-pressed={p.relayOff}>Off</button>
              </span>
            </form>
          ))}
          <p className="d-hint" style={{ margin: 0 }}>Mail to these reaches your real inbox. Each platform has its own. Switch one off and mail to it is dropped.</p>
        </section>
      )}

      <section className="d-card" aria-labelledby="always">
        <span className="d-label" id="always">Always on</span>
        <div className="d-row-line"><span>Ranges hidden until you press and hold</span><span>On</span></div>
        <div className="d-row-line"><span>Your record blurs when you leave the tab</span><span>On</span></div>
        <div className="d-row-line"><span>Sharing</span><span>There is no share button and no public profile</span></div>
      </section>

      <section className="d-card" aria-labelledby="signing">
        <span className="d-label" id="signing">Signing in</span>
        <p className="d-muted">Passkeys sign you in with your fingerprint, face or screen lock, on any platform&apos;s Muslim Quotient page. Recovery codes get you in if you lose the mailbox you signed up with.</p>
        {passkeys.map((k) => (
          <form action={removeKey} className="d-row-line" key={k.id} style={{ alignItems: "center" }}>
            <input type="hidden" name="passkey" value={k.id} />
            <span style={{ color: "#fff" }}>{k.name} <small className="d-hint">added {ago(k.created_at)}{k.last_used_at ? `, last used ${ago(k.last_used_at)}` : ""}</small></span>
            <button className="d-link" type="submit">Remove</button>
          </form>
        ))}
        <AddPasskey />
        <div style={{ borderTop: "1px solid #2c3a52", paddingTop: 14 }}><RecoveryCodes left={codesLeft} /></div>
      </section>

      <section className="d-card" aria-labelledby="merge">
        <span className="d-label" id="merge">Two accounts?</span>
        <p className="d-muted">If you made a second Muslim Quotient account with another email, merge it into this one.</p>
        <div><a className="d-btn line" href="/dashboard/merge">Merge another account</a></div>
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
