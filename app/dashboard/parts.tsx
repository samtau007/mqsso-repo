import { SCOPES } from "@/lib/scopes";

// Small pieces the dashboard screens share.

export const PART_LABEL: Record<string, string> = { learning: "Learning", practice: "Practice", reflection: "Reflection" };
export const PART_AR: Record<string, string> = { learning: "علم", practice: "عمل", reflection: "تفكر" };

export function Tile({ name }: { name: string }) {
  return <span className="d-tile" aria-hidden="true">{Array.from(name)[0]?.toUpperCase()}</span>;
}

/** What a platform may add, in the person's words. */
export function adds(scopes: string[]): string {
  const parts = (["learning", "practice", "reflection"] as const).filter((p) => scopes.includes(`mq.record.${p}`)).map((p) => PART_LABEL[p]);
  const settings = scopes.some((s) => s.startsWith("mq.settings."));
  if (parts.length) return `Adds to ${parts.join(", ")}${settings ? " · uses your settings" : ""}`;
  return settings ? "Uses your settings only. Adds nothing to your record" : "Signs you in";
}

export function seesLabel(scope: string): string {
  return SCOPES.find((s) => s.scope === scope)?.sees ?? scope;
}

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "today", "yesterday", "3 days ago". */
export function ago(d: Date, now: Date = new Date()): string {
  const days = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86_400_000);
  if (days < 30) return RTF.format(-days, "day");
  const months = Math.round(days / 30);
  return RTF.format(-months, "month");
}

/** A range that stays blurred until pressed and held (PRD: ranges hidden until held). */
export function Held({ children, label }: { children: React.ReactNode; label: string }) {
  return <span className="d-held" tabIndex={0} role="button" aria-label={`${label}. Press and hold to show`}>{children}</span>;
}

const HIJRI = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** "3 Rabiʻ II 1448". */
export function hijri(d: Date): string {
  return HIJRI.format(d).replace(/\s*AH$/, "");
}
