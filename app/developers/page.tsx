import { listPlatforms } from "@/lib/clients";
import { currentDeveloper } from "@/lib/portal";
import SignIn from "./SignIn";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const dev = await currentDeveloper();

  if (!dev) {
    return (
      <>
        <h1>Add Sign in with Muslim Quotient to your platform</h1>
        <p className="p-lede">Sign in with your work email to register a platform and get your keys. Read the <a href="/guide" style={{ color: "#c9b6dc" }}>developer guide</a> first.</p>
        <SignIn />
      </>
    );
  }

  const mine = await listPlatforms(dev.id);
  const all = dev.isAdmin ? (await listPlatforms(null)).filter((p) => p.ownerId !== dev.id) : [];

  return (
    <>
      <h1>Your platforms</h1>
      <p className="p-lede">Each platform gets its own client ID, secret and notice signing secret.</p>
      <a className="p-btn" href="/new">Register a platform</a>
      {mine.length ? (
        <ul className="p-list">
          {mine.map((p) => (
            <li key={p.clientId}>
              <a href={`/platforms/${p.clientId}`}><span>{p.name}</span><span className={`p-tag${p.approved ? " on" : ""}`}>{p.approved ? "Approved" : "Waiting for approval"}</span></a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-lede">No platforms yet.</p>
      )}
      {dev.isAdmin && (
        <>
          <h2>Every platform (Muslim Quotient only)</h2>
          {all.length ? (
            <ul className="p-list">
              {all.map((p) => (
                <li key={p.clientId}>
                  <a href={`/platforms/${p.clientId}`}><span>{p.name}</span><span className={`p-tag${p.approved ? " on" : ""}`}>{p.approved ? "Approved" : "Waiting for approval"}</span></a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-lede">No other platforms.</p>
          )}
        </>
      )}
    </>
  );
}
