import { redirect } from "next/navigation";
import { directory } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId } from "@/lib/site/session";
import { Tile } from "../parts";

/**
 * Connect a platform: approved platforms the person has not connected yet. Connecting happens
 * on the platform itself, with its Sign in with Muslim Quotient button.
 */
export default async function Connect() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const list = await directory(personId, siteClient().clientId);

  return (
    <>
      <div>
        <h1 className="d-title">Connect a platform</h1>
        <p className="d-sub">Platforms you connect add to your picture. You choose what each one may do, and you can disconnect any time. Open one and press Sign in with Muslim Quotient there.</p>
      </div>
      <section className="d-card">
        {list.length === 0 && <p className="d-muted">Every platform that works with Muslim Quotient is already connected.</p>}
        {list.map((c) => (
          <div className="d-plat" key={c.client_id}>
            <Tile name={c.name} />
            <div><span>{c.name}</span><span>{c.website.replace(/^https?:\/\//, "")}</span></div>
            <a className="d-btn" href={c.website} rel="noopener">Open</a>
          </div>
        ))}
      </section>
      <div className="d-note">
        <b>Using a platform that is not here?</b><br />
        Ask them to add Sign in with Muslim Quotient. Everything they need is in the developer guide: <a className="d-link" href={`${env.developersOrigin}/guide`}>{env.developersOrigin.replace(/^https?:\/\//, "")}/guide</a>
      </div>
    </>
  );
}
