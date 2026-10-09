import type { Metadata } from "next";
import { checks, type Check } from "@/lib/status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status · Muslim Quotient" };

const WORD: Record<Check["state"], string> = { working: "Working", slow: "Slow", down: "Down", "not yet": "Not yet on" };
const COLOUR: Record<Check["state"], string> = { working: "#c9b6dc", slow: "#d9b46a", down: "#e6a3a3", "not yet": "#9dadc6" };

/** Public status: whether each part of Muslim Quotient works right now. No usage numbers. */
export default async function Status() {
  const list = await checks();
  const down = list.some((c) => c.state === "down");
  const slow = list.some((c) => c.state === "slow");
  return (
    <main style={{ minHeight: "100vh", background: "#0c121d", color: "#fff", padding: "48px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <a href="/" style={{ color: "#9dadc6", textDecoration: "none", fontSize: 14 }}>‹ Muslim Quotient</a>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-.03em" }}>{down ? "Something is down" : slow ? "Some parts are slow" : "Everything is working"}</h1>
        <p style={{ margin: 0, color: "#9dadc6" }}>Checked {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Reload to check again.</p>
        <section style={{ background: "#18212f", border: "1px solid #2c3a52", borderRadius: 22, padding: "8px 20px" }}>
          {list.map((c) => (
            <div key={c.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "14px 0", borderTop: "1px solid #2c3a52", flexWrap: "wrap" }} data-testid="status-row">
              <span style={{ display: "flex", flexDirection: "column" }}><b style={{ fontWeight: 600 }}>{c.name}</b><small style={{ color: "#9dadc6" }}>{c.note}</small></span>
              <span style={{ color: COLOUR[c.state], fontWeight: 600 }}>{WORD[c.state]}</span>
            </div>
          ))}
        </section>
        <p style={{ margin: 0, color: "#9dadc6", fontSize: 14 }}>Platforms that use Muslim Quotient can write to us from the developer portal.</p>
      </div>
    </main>
  );
}
