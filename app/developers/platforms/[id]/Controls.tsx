"use client";

import { useFormState, useFormStatus } from "react-dom";
import { rotate, sector, type RotateState, type SectorState } from "../../actions";
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
