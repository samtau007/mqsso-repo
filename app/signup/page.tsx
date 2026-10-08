"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import Orbit from "@/components/Orbit";
import Arrow from "@/components/Arrow";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

export default function SignUp() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError("We could not send a code to that address. Check it and try again.");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) return setError("That code did not match. Check the latest email and try again.");
    router.push("/questions");
    router.refresh();
  }

  async function google() {
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${site}/auth/callback?next=/questions` } });
  }

  return (
    <Shell>
      <main className="wrap flow">
        <div className="stage">
          <Orbit />
          <div className="card">
            <div className="card-in">
              {step === "email" ? (
                <form onSubmit={sendCode}>
                  <div className="c-top"><span>Step 1 of 2</span><span>Sign up</span></div>
                  <p className="c-title">Sign up to begin your Muslim Quotient.</p>
                  <div className="field">
                    <label htmlFor="email">Your email</label>
                    <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                  {error && <p className="err">{error}</p>}
                  <div className="cta">
                    <button className="btn btn-glow" type="submit" disabled={busy || !email}>{busy ? "Sending…" : "Send me a code"} <Arrow /></button>
                  </div>
                  <div className="or">or</div>
                  <button className="btn btn-line" type="button" onClick={google}>Continue with Google</button>
                  <p className="fine">We send a 6-digit code to your email. The questions open once it is verified.</p>
                </form>
              ) : (
                <form onSubmit={verify}>
                  <div className="c-top"><span>Step 2 of 2</span><span>Verify</span></div>
                  <p className="c-title">Enter the code we sent to {email}.</p>
                  <div className="field">
                    <label htmlFor="code">6-digit code</label>
                    <input id="code" className="input code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  {error && <p className="err">{error}</p>}
                  <div className="cta">
                    <button className="btn btn-glow" type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify and begin"} <Arrow /></button>
                  </div>
                  <p className="fine">
                    <button type="button" className="link" onClick={() => { setStep("email"); setCode(""); setError(null); }}>Use a different email</button>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}
