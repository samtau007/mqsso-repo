"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { makeCodes, mergeStep, passkeyFinish, passkeyOptions, type MergeState } from "./actions";

const dec = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
};
const enc = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Adds a passkey for this browser's device. The same passkey then signs in on every platform's Muslim Quotient page. */
export function AddPasskey() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setStatus(null);
    if (!window.PublicKeyCredential) return setStatus("This browser cannot make passkeys.");
    setBusy(true);
    try {
      const o = await passkeyOptions();
      const cred = (await navigator.credentials.create({
        publicKey: {
          ...o,
          challenge: dec(o.challenge),
          user: { ...o.user, id: dec(o.user.id) },
          excludeCredentials: (o.excludeCredentials ?? []).map((c) => ({ ...c, id: dec(c.id) })),
        } as unknown as PublicKeyCredentialCreationOptions,
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("none");
      const r = cred.response as AuthenticatorAttestationResponse;
      const result = await passkeyFinish({
        id: cred.id, rawId: enc(cred.rawId), type: "public-key", clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: (cred.authenticatorAttachment ?? undefined) as "platform" | "cross-platform" | undefined,
        response: { clientDataJSON: enc(r.clientDataJSON), attestationObject: enc(r.attestationObject), transports: (r.getTransports?.() ?? []) as never },
      });
      setStatus(result.ok ? "Passkey added." : "That passkey could not be added. Try again.");
    } catch (e) {
      setStatus((e as Error).name === "InvalidStateError" ? "This device already has a passkey for Muslim Quotient." : "No passkey was added.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-steps" style={{ alignItems: "center" }}>
      <button className="d-btn" type="button" onClick={add} disabled={busy}>{busy ? "Waiting for your device" : "Add a passkey"}</button>
      {status && <span className="d-ok" role="status">{status}</span>}
    </div>
  );
}

/** Ten recovery codes, shown once. */
export function RecoveryCodes({ left }: { left: number }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    if (left > 0 && !confirm("Your earlier recovery codes will stop working. Make new ones?")) return;
    setBusy(true);
    setCodes(await makeCodes());
    setBusy(false);
  };
  if (codes) {
    return (
      <div className="d-codes" data-testid="recovery-codes">
        <p className="d-muted">Keep these somewhere safe, away from this device: print them, or write them down. Each works once. They will not be shown again.</p>
        <ol>{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
        <div className="d-steps"><button className="d-btn line" type="button" onClick={() => window.print()}>Print</button></div>
      </div>
    );
  }
  return (
    <div className="d-steps" style={{ alignItems: "center" }}>
      <button className="d-btn line" type="button" onClick={make} disabled={busy}>{left ? "Make new recovery codes" : "Make recovery codes"}</button>
      <span className="d-hint">{left ? `${left} unused ${left === 1 ? "code" : "codes"} left` : "None yet"}</span>
    </div>
  );
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className="d-btn" type="submit" disabled={pending}>{pending ? busy : label}</button>;
}

export function MergeFlow() {
  const [state, action] = useFormState(mergeStep, { step: "email" } as MergeState);
  const p = state.preview;
  return (
    <form action={action} className="d-card">
      {state.step === "email" && (
        <>
          <span className="d-label">The other account</span>
          <p className="d-muted">Enter the email of the Muslim Quotient account you want to fold into this one. We send it a code to prove it is yours.</p>
          <div className="d-field"><label htmlFor="m-email">Its email</label><input className="d-input" id="m-email" name="email" type="email" required defaultValue={state.email} /></div>
        </>
      )}
      {state.step === "code" && (
        <>
          <span className="d-label">Prove the other account</span>
          <p className="d-muted">We sent a code to {state.email}.</p>
          <div className="d-field"><label htmlFor="m-code">6-digit code</label><input className="d-input" id="m-code" name="code" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" /></div>
        </>
      )}
      {state.step === "confirm" && p && (
        <>
          <span className="d-label">Merge into this account</span>
          <p className="d-muted">The account under {state.email}, now called {p.givenName}, has {p.platforms} connected {p.platforms === 1 ? "platform" : "platforms"}, {p.entries} {p.entries === 1 ? "entry" : "entries"} and {p.goals} {p.goals === 1 ? "goal" : "goals"}. They all move here, and that account is deleted, with its email. Where both accounts are connected to the same platform, this account&apos;s connection stays.</p>
        </>
      )}
      {state.error && <p className="d-err" role="alert">{state.error}</p>}
      <div>
        <Submit
          label={state.step === "email" ? "Send a code" : state.step === "code" ? "Continue" : "Merge and delete the other account"}
          busy={state.step === "confirm" ? "Merging" : "Checking"}
        />
      </div>
    </form>
  );
}
