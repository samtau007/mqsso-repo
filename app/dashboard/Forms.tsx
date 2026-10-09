"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteEverything, goal, prayer, type FormState } from "./actions";

function Submit({ label, busy, line, danger }: { label: string; busy: string; line?: boolean; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`d-btn${line ? " line" : ""}`} type="submit" disabled={pending} style={danger ? { color: "#e6a3a3" } : undefined}>
      {pending ? busy : label}
    </button>
  );
}

function Result({ state, saved }: { state: FormState; saved: string }) {
  if (state.error) return <p className="d-err" role="alert">{state.error}</p>;
  if (state.saved) return <p className="d-ok" role="status">{saved}</p>;
  return null;
}

export function GoalForm({ months, platforms }: { months: string[]; platforms: { clientId: string; name: string }[] }) {
  const [state, action] = useFormState(goal, {} as FormState);
  return (
    <form action={action} className="d-card" style={{ borderColor: "#8a6ca6" }}>
      <span className="d-label">Set a goal</span>
      <div className="d-form three">
        <div className="d-field"><label htmlFor="g-title">What I want to do</label><input className="d-input" id="g-title" name="title" required maxLength={120} placeholder="Memorise Sūrat al-Mulk" /></div>
        <div className="d-field"><label htmlFor="g-by">By when</label>
          <select className="d-input" id="g-by" name="by" defaultValue="">
            <option value="">No date</option>
            {months.map((m) => <option key={m} value={m}>Before the end of {m}</option>)}
          </select>
        </div>
        <div className="d-field"><label htmlFor="g-where">Where I will do it</label>
          <select className="d-input" id="g-where" name="where" defaultValue="">
            <option value="">Not on a platform</option>
            {platforms.map((p) => <option key={p.clientId} value={p.clientId}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="d-steps" style={{ alignItems: "center" }}><Submit label="Set this goal" busy="Saving" /><Result state={state} saved="Goal set." /></div>
    </form>
  );
}

type Settings = { city: string; lat: string; lng: string; method: string; asr: string; hijriAdjust: number; language: string; tz: string };

export function PrayerForm({ initial, methods, asr, languages }: { initial: Settings; methods: Record<string, string>; asr: Record<string, string>; languages: Record<string, string> }) {
  const [state, action] = useFormState(prayer, {} as FormState);
  const [zones, setZones] = useState<string[]>([]);
  const [tz, setTz] = useState(initial.tz);
  useEffect(() => {
    setZones((Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []);
    if (!initial.tz) setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [initial.tz]);

  return (
    <form action={action} className="d-card">
      <div className="d-form two">
        <div className="d-field"><label htmlFor="p-city">City</label><input className="d-input" id="p-city" name="city" defaultValue={initial.city} maxLength={80} placeholder="Hyderabad" /></div>
        <div className="d-form two" style={{ gap: 10 }}>
          <div className="d-field"><label htmlFor="p-lat">Latitude, if you know it</label><input className="d-input" id="p-lat" name="lat" inputMode="decimal" defaultValue={initial.lat} placeholder="17.38" /></div>
          <div className="d-field"><label htmlFor="p-lng">Longitude</label><input className="d-input" id="p-lng" name="lng" inputMode="decimal" defaultValue={initial.lng} placeholder="78.48" /></div>
        </div>
        <div className="d-field"><label htmlFor="p-method">Calculation method</label>
          <select className="d-input" id="p-method" name="method" defaultValue={initial.method}>
            <option value="">Not set</option>
            {Object.entries(methods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="d-field"><label htmlFor="p-asr">ʿAṣr</label>
          <select className="d-input" id="p-asr" name="asr" defaultValue={initial.asr}>
            <option value="">Not set</option>
            {Object.entries(asr).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="d-field"><label htmlFor="p-hijri">Hijri date adjustment</label>
          <select className="d-input" id="p-hijri" name="hijri_adjust" defaultValue={String(initial.hijriAdjust)}>
            {[-2, -1, 0, 1, 2].map((n) => <option key={n} value={n}>{n === 0 ? "None" : `${n > 0 ? "+" : ""}${n} ${Math.abs(n) === 1 ? "day" : "days"}`}</option>)}
          </select>
        </div>
        <div className="d-field"><label htmlFor="p-lang">Language</label>
          <select className="d-input" id="p-lang" name="language" defaultValue={initial.language}>
            <option value="">Not set</option>
            {Object.entries(languages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="d-field"><label htmlFor="p-tz">Time zone</label>
          <select className="d-input" id="p-tz" name="tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            <option value="">Not set</option>
            {(zones.includes(tz) || !tz ? zones : [tz, ...zones]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>
      <p className="d-hint" style={{ margin: 0 }}>The location is kept to about a kilometre. Platforms you allowed are told when you save.</p>
      <div className="d-steps" style={{ alignItems: "center" }}><Submit label="Save" busy="Saving" /><Result state={state} saved="Saved. Your platforms have been told." /></div>
    </form>
  );
}

export function DeleteForm({ givenName }: { givenName: string }) {
  const [state, action] = useFormState(deleteEverything, {} as FormState);
  return (
    <form action={action} className="d-card" id="delete" style={{ borderColor: "#6b3a3a" }}>
      <span className="d-label">Delete everything</span>
      <p className="d-muted">Removes your email, your names, every connection, everything your platforms added, your goals and your settings, now and for good. Every connected platform is told. Your accounts on those platforms stay theirs.</p>
      <input type="hidden" name="expected" value={givenName} />
      <div className="d-field"><label htmlFor="d-confirm">Type your given name, {givenName}, to confirm</label><input className="d-input" id="d-confirm" name="confirm" autoComplete="off" required /></div>
      <Result state={state} saved="" />
      <div><Submit label="Delete everything" busy="Deleting" line danger /></div>
    </form>
  );
}
