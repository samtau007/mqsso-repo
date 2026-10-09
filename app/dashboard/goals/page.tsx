import { redirect } from "next/navigation";
import { comingHijriMonths, goalsOf, platformCards } from "@/lib/dashboard";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { goalStatus } from "../actions";
import { GoalForm } from "../Forms";

/** My goals, as in docs/design/Goals.html. Each goal opens the platform where the work happens. */
export default async function Goals() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const [goals, platforms] = await Promise.all([goalsOf(personId), platformCards(personId, siteClient().clientId)]);
  const active = goals.filter((g) => g.status === "active");
  const past = goals.filter((g) => g.status !== "active");

  return (
    <>
      <div>
        <h1 className="d-title">My goals</h1>
        <p className="d-sub">You set where you are heading. Each goal opens the platform where the work happens, and what that platform adds shows in your picture.</p>
      </div>
      <GoalForm months={comingHijriMonths()} platforms={platforms.map((p) => ({ clientId: p.clientId, name: p.name }))} />
      {active.length === 0 && <p className="d-muted">No goals yet.</p>}
      {active.map((g) => (
        <section className="d-card" key={g.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <b style={{ fontSize: 17 }}>{g.title}</b>
            <p className="d-muted" style={{ marginTop: 4 }}>{g.target_hijri ? `Before the end of ${g.target_hijri}` : "No date"}</p>
          </div>
          <div className="d-steps" style={{ alignItems: "center" }}>
            {g.website && <a className="d-btn line" href={g.website} rel="noopener">Continue in {g.name} →</a>}
            <form action={goalStatus} className="d-steps">
              <input type="hidden" name="goal" value={g.id} />
              <button className="d-link" name="status" value="done" type="submit">Done</button>
              <button className="d-link" name="status" value="set_aside" type="submit">Set aside</button>
            </form>
          </div>
        </section>
      ))}
      {past.length > 0 && (
        <section className="d-card">
          <span className="d-label">Done and set aside</span>
          {past.map((g) => (
            <form action={goalStatus} className="d-row-line" key={g.id}>
              <input type="hidden" name="goal" value={g.id} />
              <span>{g.title} <small className="d-hint">{g.status === "done" ? "done" : "set aside"}</small></span>
              <button className="d-link" name="status" value="active" type="submit">Bring back</button>
            </form>
          ))}
        </section>
      )}
      <div className="d-note"><b>Muslim Quotient does not teach or hold any content.</b><br />You read, learn and practise on the platforms you trust. Muslim Quotient keeps your direction, your goals and your picture in one place.</div>
    </>
  );
}
