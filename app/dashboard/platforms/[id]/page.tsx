import { notFound, redirect } from "next/navigation";
import { platformDetail } from "@/lib/dashboard";
import { currentPersonId } from "@/lib/site/session";
import { disconnect, emailChoice, withdraw } from "../../actions";
import { ago, Held, PART_LABEL, seesLabel, Tile } from "../../parts";

/** One platform, as in docs/design/PlatformDetail.html: what it added, what it may do, and the way out. */
export default async function PlatformPage({ params }: { params: { id: string } }) {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const p = await platformDetail(personId, params.id);
  if (!p) notFound();
  const permissions = p.scopes.filter((s) => s !== "openid" && s !== "email");

  return (
    <>
      <a className="d-link" href="/dashboard/platforms" style={{ textDecoration: "none" }}>‹ My platforms</a>
      <div className="d-ptop" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Tile name={p.name} />
        <div><h1 className="d-title" style={{ fontSize: 26 }}>{p.name}</h1><p className="d-sub" style={{ margin: 0 }}>{p.website.replace(/^https?:\/\//, "")} · connected {ago(p.connectedAt)}</p></div>
      </div>

      <section className="d-card" aria-labelledby="added">
        <span className="d-label" id="added">What it added · {p.total}</span>
        {p.entries.length === 0 && <p className="d-muted">Nothing yet.</p>}
        {p.entries.map((e) => (
          <div className="d-row-line" key={e.id}>
            <span>{e.title}{e.detail ? (e.type === "reflection" ? <> · <Held label={`${e.title}: ${e.detail}`}>{e.detail}</Held></> : ` · ${e.detail}`) : ""} <small className="d-hint">{PART_LABEL[e.type]}</small></span>
            <span>{ago(e.at)}</span>
          </div>
        ))}
      </section>

      <section className="d-card" aria-labelledby="may">
        <span className="d-label" id="may">What it may do</span>
        {permissions.length === 0 && <p className="d-muted">Only sign you in.</p>}
        {permissions.map((s) => (
          <form action={withdraw} className="d-row-line" key={s}>
            <input type="hidden" name="client_id" value={p.clientId} />
            <input type="hidden" name="scope" value={s} />
            <span>{seesLabel(s)}</span>
            <button className="d-link" type="submit">Take back</button>
          </form>
        ))}
        <p className="d-hint" style={{ margin: 0 }}>To allow more, the platform asks when you next sign in there.</p>
      </section>

      {p.scopes.includes("email") && (
        <section className="d-card" aria-labelledby="email">
          <span className="d-label" id="email">Email it sees</span>
          <form action={emailChoice} className="d-choice">
            <input type="hidden" name="client_id" value={p.clientId} />
            <button className={p.emailChoice === "hide" ? "on" : undefined} name="choice" value="hide" type="submit" aria-pressed={p.emailChoice === "hide"}>Hidden · relay address</button>
            <button className={p.emailChoice === "share" ? "on" : undefined} name="choice" value="share" type="submit" aria-pressed={p.emailChoice === "share"}>My real email</button>
          </form>
          {p.emailChoice === "hide" && p.relayAddress && <p className="d-hint" style={{ margin: 0 }}>It writes to {p.relayAddress}, which forwards to you.</p>}
        </section>
      )}

      <div className="d-row-line" style={{ borderTop: 0 }}><span>Its private ID for you</span><code style={{ color: "#9dadc6", overflowWrap: "anywhere" }}>{p.sub}</code></div>

      <form action={disconnect} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <input type="hidden" name="client_id" value={p.clientId} />
        <button className="d-btn line" type="submit" name="remove" value="no">Disconnect</button>
        <button className="d-link danger" type="submit" name="remove" value="yes">Disconnect and remove what it added</button>
      </form>
    </>
  );
}
