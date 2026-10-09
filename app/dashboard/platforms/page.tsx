import { redirect } from "next/navigation";
import { platformCards, type PlatformCard } from "@/lib/dashboard";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { ago, adds, PART_AR, PART_LABEL, Tile } from "../parts";

function summary(p: PlatformCard): string {
  if (p.added.practice && p.practiceDaysThisMonth) return `Kept on ${p.practiceDaysThisMonth} ${p.practiceDaysThisMonth === 1 ? "day" : "days"} this month`;
  if (p.latest) return p.latest.detail ? `${p.latest.title}, ${p.latest.detail}` : p.latest.title;
  return "Nothing added yet";
}

function Card({ p }: { p: PlatformCard }) {
  return (
    <a className="d-pcard" href={`/dashboard/platforms/${p.clientId}`}>
      <div className="d-ptop"><Tile name={p.name} /><div style={{ minWidth: 0 }}><b>{p.name}</b><br /><small>{adds(p.scopes)}</small></div></div>
      <span style={{ fontSize: 15 }}>{summary(p)}</span>
      <small>{p.latest ? `Last added ${ago(p.latest.at)}` : `Connected ${ago(p.connectedAt)}`}</small>
    </a>
  );
}

/** My platforms, grouped by the part each one adds to, as in docs/design/Platforms.html. */
export default async function Platforms({ searchParams }: { searchParams: { done?: string } }) {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const cards = await platformCards(personId, siteClient().clientId);
  const part = (p: PlatformCard) =>
    (["reflection", "practice", "learning"] as const).find((x) => p.scopes.includes(`mq.record.${x}`) || p.added[x] > 0) ?? null;
  const groups = (["learning", "practice", "reflection"] as const).map((k) => ({ k, items: cards.filter((p) => part(p) === k) }));
  const other = cards.filter((p) => part(p) === null);

  return (
    <>
      <div>
        <h1 className="d-title">My platforms</h1>
        <p className="d-sub">{cards.length ? `${cards.length} ${cards.length === 1 ? "platform" : "platforms"} connected. Each one knows you by a different private ID.` : "No platforms yet."}</p>
      </div>
      {searchParams.done === "disconnected" && <p className="d-ok" role="status">Disconnected. The platform has been told, and can no longer add to your record.</p>}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.k} aria-label={PART_LABEL[g.k]} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="d-section-h"><span className="d-ar" lang="ar">{PART_AR[g.k]}</span><h2>{PART_LABEL[g.k]}</h2><span>{g.items.length} {g.items.length === 1 ? "platform" : "platforms"}</span></div>
          <div className="d-cards">{g.items.map((p) => <Card key={p.clientId} p={p} />)}</div>
        </section>
      ))}
      {other.length > 0 && (
        <section aria-label="Sign-in and settings only" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="d-section-h"><h2>Sign-in and settings</h2><span>{other.length}</span></div>
          <div className="d-cards">{other.map((p) => <Card key={p.clientId} p={p} />)}</div>
        </section>
      )}
      <a className="d-btn line" href="/dashboard/connect">Connect a platform</a>
    </>
  );
}
