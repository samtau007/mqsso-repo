import { redirect } from "next/navigation";
import { METHODS, LANGUAGES, ASR } from "@/lib/account";
import { overview, settingsOf } from "@/lib/dashboard";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { decide } from "./actions";
import { adds, Held, Tile } from "./parts";

const ISTIGHFAR = process.env.MQ_ISTIGHFAR_URL || "https://istighfar.club";
const MOHASABA = process.env.MQ_MOHASABA_URL || "https://app.mohasaba.io";

export default async function Overview() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const [o, s] = await Promise.all([overview(personId, siteClient().clientId), settingsOf(personId)]);
  if (!o) redirect("/signin");
  const range = o.latestRanges[0];

  return (
    <>
      {o.imports.map((i) => (
        <section className="d-card d-import" key={i.id} aria-label={`Past activity from ${i.name}`}>
          <span className="d-label">Past activity</span>
          <p className="d-import-q">{i.name} wants to add {i.entries} past {i.entries === 1 ? "entry" : "entries"} to your record.</p>
          <p className="d-muted">They keep their original dates. You can add them all or none.</p>
          <form action={decide} className="d-steps">
            <input type="hidden" name="import" value={i.id} />
            <button className="d-btn" name="choice" value="approve" type="submit">Add them</button>
            <button className="d-btn line" name="choice" value="decline" type="submit">Not now</button>
          </form>
        </section>
      ))}

      <div className="d-row">
        <section className="d-card" style={{ flex: "1 1 340px" }}>
          <span className="d-label">Your range</span>
          {range ? (
            <>
              <Held label={`${range.title}: ${range.low} to ${range.high} of ${range.of}`}>
                <span className="d-range">{range.low}–{range.high}<small>of {range.of}</small></span>
              </Held>
              <p className="d-muted">{range.title}, from {range.from}. Press and hold to see it. You get a range. No one is ranked.</p>
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
          <a className="d-btn" href="/dashboard/picture" style={{ marginTop: 8 }}>See my picture</a>
        </section>
      </div>

      <section className="d-card" aria-labelledby="picture">
        <h2 id="picture">My picture</h2>
        <p className="d-muted">What your connected platforms add. Muslim Quotient holds no content; the work happens on the platforms.</p>
        <div className="d-grid">
          <div className="d-part"><span className="d-ar" lang="ar">علم</span><b>Learning</b><div className="d-item"><span>{o.month.learning ? `${o.month.learning} this month` : "Nothing yet"}</span><span>Lessons, courses, reading and gatherings</span></div></div>
          <div className="d-part"><span className="d-ar" lang="ar">عمل</span><b>Practice</b><div className="d-item"><span>{o.month.practiceDays ? `Kept on ${o.month.practiceDays} ${o.month.practiceDays === 1 ? "day" : "days"} this month` : "Nothing yet"}</span><span>Acts you keep, like daily istighfar</span></div></div>
          <div className="d-part reflect"><span className="d-ar" lang="ar">تفكر</span><b>Reflection</b>
            {o.latestRanges.length ? o.latestRanges.map((r) => (
              <div className="d-item" key={r.title}><span>{r.title}: <Held label={`${r.title}: ${r.low} to ${r.high} of ${r.of}`}>{r.low}–{r.high} of {r.of}</Held></span><span>from {r.from}</span></div>
            )) : <div className="d-item"><span>Nothing yet</span><span>Results arrive as ranges from tests like Mohasaba</span></div>}
          </div>
        </div>
      </section>

      <div className="d-row">
        <section className="d-card" aria-labelledby="platforms" style={{ flex: "2 1 420px" }}>
          <h2 id="platforms">Connected platforms</h2>
          {o.platforms.map((p) => (
            <a className="d-plat" key={p.clientId} href={`/dashboard/platforms/${p.clientId}`} style={{ color: "inherit", textDecoration: "none" }}>
              <Tile name={p.name} />
              <div><span>{p.name}</span><span>{adds(p.scopes)}{p.added ? ` · ${p.added} ${p.added === 1 ? "entry" : "entries"} added` : ""}</span></div>
              <span className="d-tag">Connected</span>
            </a>
          ))}
          {o.platforms.length === 0 && <p className="d-muted">No platforms yet. Sign in with Muslim Quotient on a platform you use, and it appears here.</p>}
          <div className="d-steps">
            <a className="d-btn" href={ISTIGHFAR}>Connect istighfar.club</a>
            <a className="d-btn line" href={MOHASABA}>Take your first Mohasaba</a>
          </div>
        </section>

        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <section className="d-card" aria-labelledby="prayer">
            <h2 id="prayer">Prayer settings</h2>
            <p className="d-muted">Set once. Every connected platform you allow uses them.</p>
            {s ? (
              <>
                <div className="d-row-line"><span>Location</span><span>{s.prayer_city ?? "Not set"}</span></div>
                <div className="d-row-line"><span>Calculation method</span><span>{s.prayer_method ? METHODS[s.prayer_method] : "Not set"}</span></div>
                <div className="d-row-line"><span>ʿAṣr</span><span>{s.asr_method ? ASR[s.asr_method as keyof typeof ASR] : "Not set"}</span></div>
                <div className="d-row-line"><span>Language</span><span>{s.language ? LANGUAGES[s.language] : "Not set"}</span></div>
              </>
            ) : <p className="d-muted">Not set yet.</p>}
            <a className="d-link" href="/dashboard/prayer">{s ? "Change" : "Set them"}</a>
          </section>
          <section className="d-card" aria-labelledby="privacy">
            <h2 id="privacy">Privacy</h2>
            <p className="d-muted">Each platform knows you by a different private ID, so they cannot match you with each other. You choose whether each one sees your real email or a private relay address.</p>
            <div className="d-steps">
              <a className="d-btn line" href="/dashboard/export">Export my record</a>
              <a className="d-btn line" href="/dashboard/privacy#delete" style={{ color: "#e6a3a3" }}>Delete everything</a>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
