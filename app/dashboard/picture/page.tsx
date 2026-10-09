import { redirect } from "next/navigation";
import { picture } from "@/lib/dashboard";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { Held, hijri } from "../parts";

/** One measure per chart, in one colour, every value labelled; a table for screen readers. */
function MonthChart({ title, unit, data }: { title: string; unit: string; data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="d-card" style={{ flex: "1 1 320px" }} aria-label={title}>
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      <div className="d-chart" aria-hidden="true">
        {data.map((d) => (
          <div key={d.label} title={`${d.label}: ${d.value} ${unit}`}>
            <b>{d.value || ""}</b>
            <i style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="d-chart-x" aria-hidden="true">{data.map((d) => <span key={d.label}>{d.label.replace(/ \d{4}$/, "")}</span>)}</div>
      <table className="sr-only"><caption>{title}</caption><tbody>{data.map((d) => <tr key={d.label}><th>{d.label}</th><td>{d.value} {unit}</td></tr>)}</tbody></table>
    </section>
  );
}

export default async function Picture() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const p = await picture(personId, siteClient().clientId);
  const learnedMax = Math.max(1, ...p.byPlatform.map((x) => x.learning));
  const nothing = p.months.every((m) => !m.learning && !m.practiceDays) && !p.ranges.length;

  return (
    <>
      <div>
        <h1 className="d-title">My picture</h1>
        <p className="d-sub">What your connected platforms have added, month by Hijri month. {nothing ? "Nothing yet: it fills as your platforms send what you do there." : ""}</p>
      </div>
      <div className="d-row">
        <MonthChart title="Learning, entries by month" unit="entries" data={p.months.map((m) => ({ label: m.label, value: m.learning }))} />
        <MonthChart title="Practice, days kept by month" unit="days" data={p.months.map((m) => ({ label: m.label, value: m.practiceDays }))} />
      </div>

      <section className="d-card" aria-labelledby="ranges">
        <h2 id="ranges" style={{ fontSize: 18 }}>Reflection results, as ranges</h2>
        {p.ranges.length === 0 && <p className="d-muted">No results yet. They arrive as ranges from tests you connect, like Mohasaba.</p>}
        {p.ranges.map((r) => (
          <div key={r.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <b style={{ fontSize: 15 }}>{r.title}</b>
            {r.points.map((x, i) => (
              <div className="d-row-line" key={i}>
                <span>{x.label} · from {x.from}</span>
                <Held label={`${r.title} on ${x.label}: ${x.low} to ${x.high} of ${x.of}`}><span style={{ color: "#fff" }}>{x.low}–{x.high} of {x.of}</span></Held>
              </div>
            ))}
          </div>
        ))}
        <p className="d-hint" style={{ margin: 0 }}>Press and hold a range to see it. You get a range. No one is ranked.</p>
      </section>

      <div className="d-row">
        <section className="d-card" style={{ flex: "1 1 320px" }} aria-labelledby="where">
          <h2 id="where" style={{ fontSize: 18 }}>Where your learning comes from</h2>
          {p.byPlatform.length === 0 && <p className="d-muted">Nothing yet.</p>}
          {p.byPlatform.map((x) => (
            <div className="d-hbar" key={x.name}>
              <span>{x.name}</span>
              <span aria-hidden="true"><i style={{ width: `${(x.learning / learnedMax) * 100}%` }} /></span>
              <span>{x.learning}</span>
            </div>
          ))}
        </section>
        <section className="d-card" style={{ flex: "1 1 320px" }} aria-labelledby="middle">
          <h2 id="middle" style={{ fontSize: 18 }}>What you are in the middle of</h2>
          {p.middle.length === 0 && <p className="d-muted">Nothing in progress.</p>}
          {p.middle.map((x) => (
            <div key={`${x.from}-${x.title}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}><span>{x.title}</span><span style={{ color: "#9dadc6" }}>{x.done} of {x.of}</span></div>
              <div className="d-bar" role="img" aria-label={`${x.done} of ${x.of}`}><i style={{ width: `${(x.done / x.of) * 100}%` }} /></div>
              <small className="d-hint">{x.from}</small>
            </div>
          ))}
        </section>
      </div>

      <section className="d-card" aria-labelledby="journey">
        <h2 id="journey" style={{ fontSize: 18 }}>Your journey</h2>
        <div className="d-timeline">
          {p.journey.map((j, i) => <div key={i}><small>{hijri(j.at)}</small><span>{j.text}</span></div>)}
        </div>
      </section>
    </>
  );
}
