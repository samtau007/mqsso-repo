"use client";

import { useFormState, useFormStatus } from "react-dom";
import { register, type RegisterState } from "../actions";
import Secrets from "../Secrets";

type ScopeOption = { scope: string; gives: string };

function Submit() {
  const { pending } = useFormStatus();
  return <button className="p-btn" type="submit" disabled={pending}>{pending ? "Registering" : "Register platform"}</button>;
}

export default function RegisterForm({ scopes }: { scopes: ScopeOption[] }) {
  const [state, action] = useFormState(register, {} as RegisterState);

  if (state.issued) {
    return (
      <div className="p-card">
        <h2 style={{ marginTop: 0 }}>Registered</h2>
        <p className="p-lede">Your platform is waiting for approval. Until then it cannot sign people in.</p>
        <Secrets issued={state.issued} />
        <a className="p-btn line" href={`/platforms/${state.issued.clientId}`}>See the platform</a>
      </div>
    );
  }

  return (
    <form action={action} className="p-card">
      <div className="p-field"><label htmlFor="name">Platform name</label><input className="p-input" id="name" name="name" required maxLength={80} /></div>
      <div className="p-field"><label htmlFor="website">Website</label><input className="p-input" id="website" name="website" type="url" required placeholder="https://yourplatform.com" /></div>
      <div className="p-field"><label htmlFor="description">Short description</label><textarea className="p-input" id="description" name="description" required maxLength={500} /></div>

      <fieldset className="p-field">
        <legend>How your platform signs in</legend>
        <label className="p-check"><input type="radio" name="client_type" value="server" required defaultChecked /><span>From a server<small>Keeps a client secret. Websites with a back end.</small></span></label>
        <label className="p-check"><input type="radio" name="client_type" value="public" required /><span>From a browser extension, or a mobile or desktop client without a server<small>No client secret; PKCE only.</small></span></label>
      </fieldset>

      <div className="p-field">
        <label htmlFor="redirect_uris">Redirect addresses</label>
        <textarea className="p-input" id="redirect_uris" name="redirect_uris" required placeholder="https://yourplatform.com/auth/mq/callback" />
        <small>One per line, all on the same host. https only, except http://localhost while developing.</small>
      </div>
      <div className="p-field">
        <label htmlFor="notice_uri">Notice address</label>
        <input className="p-input" id="notice_uri" name="notice_uri" type="url" placeholder="https://yourplatform.com/api/mq/notices" />
        <small>Where we send connection.revoked, account.deleted and settings.updated. Required for server sign-in.</small>
      </div>

      <fieldset className="p-field">
        <legend>Entries are sent from</legend>
        <label className="p-check"><input type="radio" name="sends_from" value="server" required defaultChecked /><span>A server</span></label>
        <label className="p-check"><input type="radio" name="sends_from" value="devices" required /><span>Devices<small>Device-checked entries arrive in phase 2.</small></span></label>
        <label className="p-check"><input type="radio" name="sends_from" value="both" required /><span>Both</span></label>
      </fieldset>

      <fieldset className="p-field">
        <legend>Permissions you will ask for</legend>
        <label className="p-check"><input type="checkbox" checked disabled /><span>openid<small>{scopes.find((s) => s.scope === "openid")?.gives}</small></span></label>
        {scopes.filter((s) => s.scope !== "openid").map((s) => (
          <label className="p-check" key={s.scope}><input type="checkbox" name="scope" value={s.scope} /><span>{s.scope}<small>{s.gives}</small></span></label>
        ))}
        <small>Ask only for what your platform uses.</small>
      </fieldset>

      {state.problems && (
        <div className="p-err" role="alert">Please fix these:<ul>{state.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}
      <Submit />
    </form>
  );
}
