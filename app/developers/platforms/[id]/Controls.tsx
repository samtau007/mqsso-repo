"use client";

import { useFormState, useFormStatus } from "react-dom";
import { askReview, edit, rotate, sector, tester, testNotice, type RotateState, type SectorState, type SimpleState, type TestNoticeState } from "../../actions";
import type { ScopeInfo } from "@/lib/scopes";
import Secrets from "../../Secrets";

function Submit({ label, busy, line }: { label: string; busy: string; line?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`p-btn${line ? " line" : ""}`} type="submit" disabled={pending}>{pending ? busy : label}</button>;
}

export function Rotate({ clientId }: { clientId: string }) {
  const [state, action] = useFormState(rotate, {} as RotateState);
  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      {state.issued ? <Secrets issued={state.issued} /> : (
        <>
          <p className="p-lede">Rotating replaces the client secret and the notice signing secret. The old ones stop working at once.</p>
          <Submit label="Rotate secrets" busy="Rotating" line />
        </>
      )}
    </form>
  );
}

export function SectorGroup({ clientId, group }: { clientId: string; group: string }) {
  const [state, action] = useFormState(sector, {} as SectorState);
  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <div className="p-field">
        <label htmlFor="group">Sector group</label>
        <input className="p-input" id="group" name="group" defaultValue={group} required pattern="[a-z0-9_.\-]{3,64}" />
        <small>Platforms in the same group get the same private ID for a person. Our own three products share one group; every outside platform keeps its own. It cannot change once anyone has connected.</small>
      </div>
      {state.error && <p className="p-err" role="alert">{state.error}</p>}
      {state.saved && <p className="p-ok" role="status">Saved.</p>}
      <Submit label="Save group" busy="Saving" line />
    </form>
  );
}

export function TestNotice({ clientId }: { clientId: string }) {
  const [state, action] = useFormState(testNotice, {} as TestNoticeState);
  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <p className="p-lede" style={{ marginTop: 0 }}>Sends a signed <code>notice.test</code> to your notice address now, so you can check your signature code before a real notice arrives.</p>
      {state.result && <p className={state.ok ? "p-ok" : "p-err"} role="status">{state.result}</p>}
      <Submit label="Send a test notice" busy="Sending" line />
    </form>
  );
}

export function AddTester({ clientId }: { clientId: string }) {
  const [state, action] = useFormState(tester, {} as SimpleState);
  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <div className="p-field"><label htmlFor="tester">Add a tester by email</label><input className="p-input" id="tester" name="email" type="email" required placeholder="you@yourplatform.com" /></div>
      {state.error && <p className="p-err" role="alert">{state.error}</p>}
      <Submit label="Add tester" busy="Adding" line />
    </form>
  );
}

export function AskReview({ clientId, items }: { clientId: string; items: string[] }) {
  const [state, action] = useFormState(askReview, {} as SimpleState);
  if (state.done) return <p className="p-ok" role="status">Thank you. Review takes up to 10 working days; we write to you here and by email.</p>;
  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <fieldset className="p-field">
        <legend>Before you ask for review</legend>
        {items.map((t, i) => (
          <label className="p-check" key={t}><input type="checkbox" name="check" value={i} /><span>{t}</span></label>
        ))}
      </fieldset>
      {state.error && <p className="p-err" role="alert">{state.error}</p>}
      <Submit label="Ask for review" busy="Sending" />
    </form>
  );
}

type Editable = { clientId: string; name: string; website: string; description: string; redirectUris: string[]; noticeUri: string | null; allowedScopes: string[]; approved: boolean };

export function EditPlatform({ p, scopes }: { p: Editable; scopes: ScopeInfo[] }) {
  const [state, action] = useFormState(edit, {} as SimpleState);
  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={p.clientId} />
      <div className="p-field"><label htmlFor="e-name">Platform name</label><input className="p-input" id="e-name" name="name" required maxLength={80} defaultValue={p.name} /></div>
      <div className="p-field"><label htmlFor="e-website">Website</label><input className="p-input" id="e-website" name="website" type="url" required defaultValue={p.website} /></div>
      <div className="p-field"><label htmlFor="e-description">Short description</label><textarea className="p-input" id="e-description" name="description" required maxLength={500} defaultValue={p.description} /></div>
      <div className="p-field"><label htmlFor="e-redirects">Redirect addresses</label><textarea className="p-input" id="e-redirects" name="redirect_uris" required defaultValue={p.redirectUris.join("\n")} /><small>One per line, all on the same host.</small></div>
      <div className="p-field"><label htmlFor="e-notice">Notice address</label><input className="p-input" id="e-notice" name="notice_uri" type="url" defaultValue={p.noticeUri ?? ""} /></div>
      <fieldset className="p-field" disabled={p.approved}>
        <legend>Permissions you ask for</legend>
        {scopes.filter((s) => s.scope !== "openid").map((s) => (
          <label className="p-check" key={s.scope}><input type="checkbox" name="scope" value={s.scope} defaultChecked={p.allowedScopes.includes(s.scope)} /><span>{s.scope}<small>{s.gives}</small></span></label>
        ))}
        <small>{p.approved ? "A live platform changes its permissions through review." : "You can change these freely while in test mode."}</small>
      </fieldset>
      {p.approved && p.allowedScopes.filter((s) => s !== "openid").map((s) => <input key={s} type="hidden" name="scope" value={s} />)}
      {state.error && <p className="p-err" role="alert">{state.error}</p>}
      {state.done && <p className="p-ok" role="status">Saved.</p>}
      {state.signingSecret && (
        <div className="p-field"><label>Notice signing secret (shown once)</label><code className="p-code" data-testid="signing-secret">{state.signingSecret}</code></div>
      )}
      <Submit label="Save changes" busy="Saving" line />
    </form>
  );
}
