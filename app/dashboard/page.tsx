import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { overview } from "@/lib/dashboard";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { SCOPES } from "@/lib/scopes";
import "./dashboard.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Muslim Quotient", robots: { index: false } };

const ISTIGHFAR = process.env.MQ_ISTIGHFAR_URL || "https://istighfar.club";
const MOHASABA = process.env.MQ_MOHASABA_URL || "https://app.mohasaba.io";

/** What a platform may add, in the person's words. */
function adds(scopes: string[]): string {
  const parts = SCOPES.filter((s) => s.scope.startsWith("mq.record.") && s.scope !== "mq.record.import" && scopes.includes(s.scope))
    .map((s) => ({ "mq.record.learning": "Learning", "mq.record.practice": "Practice", "mq.record.reflection": "Reflection" })[s.scope]);
  return parts.length ? `Adds to ${parts.join(", ")}` : "Signs you in";
}

export default async function Dashboard() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const o = await overview(personId, siteClient().clientId);
  if (!o) redirect("/signin");

  const range = o.latestRanges[0];
  const hasPlatforms = o.platforms.length > 0;

  return (
    <div className="d-page">
      <header className="d-head">
        <div className="d-head-in">
          <a className="d-brand" href="/">
            <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" strokeWidth="14" /><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#8a6ca6" strokeWidth="14" /><rect x="44" y="10" width="12" height="12" rx="2.5" fill="#ffffff" transform="rotate(45 50 16)" /></svg>
            Muslim Quotient
          </a>
          <div className="d-who">
            <span className="d-name"><b>{o.givenName}</b> · <span>new name in {o.daysToNewName} {o.daysToNewName === 1 ? "day" : "days"}</span></span>
            <form action="/signout" method="post"><button className="d-out" type="submit">Sign out</button></form>
          </div>
        </div>
      </header>

      <main className="d-body">
        <div className="d-row">
          <section className="d-card" style={{ flex: "1 1 340px" }}>
            <span className="d-label">Your range</span>
            {range ? (
              <>
                <span className="d-range">{range.low}–{range.high}<small>of {range.of}</small></span>
                <p className="d-muted">{range.title}, from {range.from}. You get a range. No one is ranked.</p>
              </>
            ) : (
              <>
                <p className="d-empty">Nothing here yet</p>
                <p className="d-muted">Your range appears when a test you connect, like Mohasaba, adds its results under Reflection. You get a range. No one is ranked.</p>
              </>
            )}
          </section>
          <section className="d-card" style={{ flex: "1 1 300px" }}>
            <span className="d-label">This month</span>
            <div className="d-line"><span>Learning</span><span>{o.month.learning} {o.month.learning === 1 ? "entry" : "entries"}</span></div>
            <div className="d-line"><span>Practice</span><span>{o.month.practiceDays} {o.month.practiceDays === 1 ? "day" : "days"} kept</span></div>
            <div className="d-line"><span>Reflection</span><span>{o.month.reflection} {o.month.reflection === 1 ? "result" : "results"}</span></div>
          </section>
        </div>

        <section className="d-card" aria-labelledby="picture">
          <h2 id="picture">My picture</h2>
          <p className="d-muted">What your connected platforms add. Muslim Quotient holds no content; the work happens on the platforms.</p>
          <div className="d-grid">
            <div className="d-part"><span className="d-ar" lang="ar">علم</span><b>Learning</b><div className="d-item"><span>{o.month.learning ? `${o.month.learning} this month` : "Nothing yet"}</span><span>Lessons, courses, reading and gatherings</span></div></div>
            <div className="d-part"><span className="d-ar" lang="ar">عمل</span><b>Practice</b><div className="d-item"><span>{o.month.practiceDays ? `Kept on ${o.month.practiceDays} ${o.month.practiceDays === 1 ? "day" : "days"} this month` : "Nothing yet"}</span><span>For example, daily istighfar from istighfar.club</span></div></div>
            <div className="d-part reflect"><span className="d-ar" lang="ar">تفكر</span><b>Reflection</b>
              {o.latestRanges.length ? o.latestRanges.map((r) => (
                <div className="d-item" key={r.title}><span>{r.title}: {r.low}–{r.high} of {r.of}</span><span>from {r.from}</span></div>
              )) : <div className="d-item"><span>Nothing yet</span><span>Results arrive as ranges from tests like Mohasaba</span></div>}
            </div>
          </div>
        </section>

        <section className="d-card" aria-labelledby="platforms">
          <h2 id="platforms">Connected platforms</h2>
          {o.platforms.map((p) => (
            <div className="d-plat" key={p.clientId}>
              <span className="d-tile" aria-hidden="true">{Array.from(p.name)[0]?.toUpperCase()}</span>
              <div><span>{p.name}</span><span>{adds(p.scopes)}</span></div>
              <span className="d-tag">Connected</span>
            </div>
          ))}
          {!hasPlatforms && <p className="d-muted">No platforms yet. Sign in with Muslim Quotient on a platform you use, and it appears here.</p>}
          <div className="d-steps">
            <a className="d-btn" href={ISTIGHFAR}>Connect istighfar.club</a>
            <a className="d-btn line" href={MOHASABA}>Take your first Mohasaba</a>
          </div>
        </section>
      </main>
    </div>
  );
}
