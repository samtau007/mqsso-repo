"use client";

import { useState } from "react";
import { checkCode, restartSignIn, sendCode, type SignInState } from "./actions";

export default function SignIn() {
  const [state, setState] = useState<SignInState>({ step: "email" });
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<SignInState>) {
    setBusy(true);
    try {
      // A successful sign-in redirects, and the action then returns nothing.
      const next = await fn();
      if (next) setState(next);
    } finally {
      setBusy(false);
    }
  }

  if (state.step === "email") {
    return (
      <form action={(fd) => run(() => sendCode(state, fd))} className="p-card p-narrow">
        <div className="p-field">
          <label htmlFor="email">Work email</label>
          <input className="p-input" id="email" name="email" type="email" required autoComplete="email" defaultValue={state.email} />
        </div>
        {state.error && <p className="p-err" role="alert">{state.error}</p>}
        <button className="p-btn" type="submit" disabled={busy}>{busy ? "Sending" : "Send me a code"}</button>
      </form>
    );
  }

  return (
    <div className="p-card p-narrow">
      <form action={(fd) => run(() => checkCode(state, fd))}>
        <p className="p-lede" style={{ marginTop: 0 }}>We sent a 6-digit code to {state.email}.</p>
        <div className="p-field">
          <label htmlFor="code">Code</label>
          <input className="p-input code" id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" />
        </div>
        {state.error && <p className="p-err" role="alert">{state.error}</p>}
        <button className="p-btn" type="submit" disabled={busy}>{busy ? "Checking" : "Sign in"}</button>
      </form>
      <button className="p-link" type="button" style={{ marginTop: 14 }} onClick={() => run(restartSignIn)}>Use a different email</button>
    </div>
  );
}
