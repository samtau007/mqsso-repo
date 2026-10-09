import { one } from "./db";
import { env } from "./env";
import { provider } from "./oidc/provider";
import { relayEnabled } from "./relay";

// The public status page. It reports whether each part works, never usage numbers.

export type Check = { name: string; state: "working" | "slow" | "down" | "not yet"; note: string };

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T }> {
  const start = Date.now();
  try {
    const value = await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))]);
    return { ok: true, ms: Date.now() - start, value };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

const state = (r: { ok: boolean; ms: number }): Check["state"] => (!r.ok ? "down" : r.ms > 1500 ? "slow" : "working");

export async function checks(): Promise<Check[]> {
  const db = await timed(() => one("select 1 as ok"));
  const signin = await timed(async () => {
    const p = provider();
    if (!p.issuer) throw new Error("no issuer");
    await one("select 1 from oidc_payloads limit 1");
    return true;
  });
  const record = await timed(() => one("select 1 from entries limit 1"));
  const notices = await timed(() => one<{ n: string }>(
    "select count(*) as n from notices where delivered_at is null and gave_up_at is null and at < now() - interval '1 day'",
  ));
  const late = Number(notices.value?.n ?? 0);

  return [
    { name: "Sign-in", state: state(signin), note: env.idOrigin.replace(/^https?:\/\//, "") },
    { name: "Record service", state: state(record), note: env.apiOrigin.replace(/^https?:\/\//, "") },
    { name: "Dashboard", state: state(db), note: env.siteOrigin.replace(/^https?:\/\//, "") },
    {
      name: "Notices to platforms",
      state: !notices.ok ? "down" : late > 0 ? "slow" : "working",
      note: late > 0 ? "Some platforms are not answering; we keep trying for 30 days" : "Delivered as they happen",
    },
    { name: "Email relay", state: relayEnabled() ? "working" : "not yet", note: relayEnabled() ? env.relayDomain : "Switched on before the first outside platform connects" },
  ];
}
