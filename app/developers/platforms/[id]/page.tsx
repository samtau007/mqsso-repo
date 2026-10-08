import { notFound, redirect } from "next/navigation";
import { getPlatform } from "@/lib/clients";
import { env } from "@/lib/env";
import { currentDeveloper } from "@/lib/portal";
import { approve } from "../../actions";
import OfficialButton from "./Button";
import { Rotate, SectorGroup } from "./Controls";

export const dynamic = "force-dynamic";

const SIGN_IN = { server: "From a server (client secret and PKCE)", public: "Browser extension, or mobile or desktop client without a server (PKCE only)" };
const SENDS = { server: "A server", devices: "Devices", both: "Server and devices" };

export default async function PlatformPage({ params }: { params: { id: string } }) {
  const dev = await currentDeveloper();
  if (!dev) redirect("/");
  const p = await getPlatform(params.id);
  if (!p || (p.ownerId !== dev.id && !dev.isAdmin)) notFound();

  return (
    <>
      <h1>{p.name}</h1>
      <p className="p-lede">
        <span className={`p-tag${p.approved ? " on" : ""}`}>{p.approved ? "Approved" : "Waiting for approval"}</span>
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

      <h2>Your button</h2>
      <div className="p-card"><OfficialButton /></div>

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
              <p className="p-lede" style={{ marginTop: 0 }}>{p.approved ? "This platform can sign people in." : "This platform cannot sign people in until it is approved."}</p>
              <button className="p-btn" type="submit">{p.approved ? "Withdraw approval" : "Approve platform"}</button>
            </form>
            <SectorGroup clientId={p.clientId} group={p.sectorGroup} />
          </div>
        </>
      )}
    </>
  );
}
