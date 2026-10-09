import { notFound, redirect } from "next/navigation";
import { CHECKLIST, getPlatform, listTesters } from "@/lib/clients";
import { SCOPES } from "@/lib/scopes";
import { env } from "@/lib/env";
import { currentDeveloper } from "@/lib/portal";
import { approve, untester } from "../../actions";
import OfficialButton from "./Button";
import { recentNotices } from "@/lib/notices";
import { AddTester, AskReview, EditPlatform, Rotate, SectorGroup, TestNotice } from "./Controls";

export const dynamic = "force-dynamic";

const SIGN_IN = { server: "From a server (client secret and PKCE)", public: "Browser extension, or mobile or desktop client without a server (PKCE only)" };
const SENDS = { server: "A server", devices: "Devices", both: "Server and devices" };

export default async function PlatformPage({ params }: { params: { id: string } }) {
  const dev = await currentDeveloper();
  if (!dev) redirect("/");
  const p = await getPlatform(params.id);
  if (!p || (p.ownerId !== dev.id && !dev.isAdmin)) notFound();
  const notices = p.noticeUri ? await recentNotices(p.clientId) : [];
  const testers = await listTesters(p.clientId);

  return (
    <>
      <h1>{p.name}</h1>
      <p className="p-lede">
        <span className={`p-tag${p.approved ? " on" : ""}`}>{p.approved ? "Live" : p.reviewRequestedAt ? "Test mode · review requested" : "Test mode"}</span>
      </p>

      <div className="p-card">
        <dl className="p-dl">
          <dt>Client ID</dt><dd><code className="p-code">{p.clientId}</code></dd>
          <dt>Website</dt><dd>{p.website}</dd>
          <dt>Description</dt><dd>{p.description}</dd>
          <dt>Signs in</dt><dd>{SIGN_IN[p.clientType]}</dd>
          <dt>Redirect addresses</dt><dd>{p.redirectUris.map((u) => <code className="p-code" key={u} style={{ marginBottom: 6 }}>{u}</code>)}</dd>
          <dt>Notice address</dt><dd>{p.noticeUri ?? "None"}</dd>
          <dt>Entries sent from</dt><dd>{SENDS[p.sendsFrom]}</dd>
          <dt>Permissions</dt><dd>{p.allowedScopes.join(", ")}</dd>
          <dt>Issuer</dt><dd><code className="p-code">{env.idOrigin}</code></dd>
          <dt>Discovery</dt><dd><code className="p-code">{`${env.idOrigin}/.well-known/openid-configuration`}</code></dd>
        </dl>
      </div>

      {!p.approved && (
        <>
          <h2>Test mode</h2>
          <div className="p-card">
            <p className="p-lede" style={{ marginTop: 0 }}>Until Muslim Quotient approves your platform, only the testers you list here can sign in with it, and the sign-in page says it is in test mode. What you send for them is marked as test and stays out of their picture. When your platform goes live, every test sign-in and test entry is cleared, so nothing from testing reaches a real record.</p>
            {testers.map((t) => (
              <form action={untester} className="p-row" key={t.email}>
                <input type="hidden" name="client_id" value={p.clientId} />
                <input type="hidden" name="email" value={t.email} />
                <span>{t.email}</span>
                <button className="p-linkbtn" type="submit">Remove</button>
              </form>
            ))}
            <AddTester clientId={p.clientId} />
          </div>

          <h2>Going live</h2>
          <div className="p-card">
            {p.reviewRequestedAt
              ? <p className="p-lede" style={{ marginTop: 0 }}>You asked for review on {p.reviewRequestedAt.toISOString().slice(0, 10)}. Review takes up to 10 working days.</p>
              : <AskReview clientId={p.clientId} items={CHECKLIST} />}
          </div>
        </>
      )}

      <h2>Details</h2>
      <div className="p-card">
        <EditPlatform p={{ clientId: p.clientId, name: p.name, website: p.website, description: p.description, redirectUris: p.redirectUris, noticeUri: p.noticeUri, allowedScopes: p.allowedScopes, approved: p.approved }} scopes={SCOPES} />
      </div>

      <h2>Your button</h2>
      <div className="p-card"><OfficialButton /></div>

      {p.noticeUri && (
        <>
          <h2>Notices</h2>
          <div className="p-card">
            <TestNotice clientId={p.clientId} />
            {notices.length > 0 && (
              <table className="p-table" style={{ marginTop: 18 }}>
                <thead><tr><th>Notice</th><th>Sent</th><th>Result</th></tr></thead>
                <tbody>
                  {notices.map((n) => (
                    <tr key={n.id} data-testid="notice-row">
                      <td><code>{n.event}</code></td>
                      <td>{n.at.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                      <td>{n.delivered ? `Delivered (${n.status})` : n.gaveUp ? "Stopped trying" : `Retrying, ${n.attempts} ${n.attempts === 1 ? "try" : "tries"}`}{!n.delivered && (n.status ? `, answered ${n.status}` : n.error ? `, ${n.error.toLowerCase()}` : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {p.clientType === "server" || p.noticeUri ? (
        <>
          <h2>Secrets</h2>
          <div className="p-card"><Rotate clientId={p.clientId} /></div>
        </>
      ) : null}

      {dev.isAdmin && (
        <>
          <h2>Muslim Quotient only</h2>
          <div className="p-card">
            <form action={approve}>
              <input type="hidden" name="client_id" value={p.clientId} />
              <input type="hidden" name="approved" value={p.approved ? "no" : "yes"} />
              <p className="p-lede" style={{ marginTop: 0 }}>{p.approved ? "This platform is live: anyone can sign in with it." : "In test mode: only its testers can sign in. Approving it clears every test sign-in and test entry."}</p>
              <button className="p-btn" type="submit">{p.approved ? "Withdraw approval" : "Approve platform"}</button>
            </form>
            <SectorGroup clientId={p.clientId} group={p.sectorGroup} />
          </div>
        </>
      )}
    </>
  );
}
