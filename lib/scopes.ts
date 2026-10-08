// The permissions a platform may ask for, worded as the person sees them.
// Source: docs/DEVELOPER_GUIDE.md, "What you can ask for". Change both together.

export type ScopeInfo = {
  scope: string;
  /** What the person reads on the permission screen. */
  sees: string;
  /** For the developer portal. */
  gives: string;
  /** Always granted with the sign-in; cannot be unticked. */
  always?: boolean;
};

export const SCOPES: ScopeInfo[] = [
  { scope: "openid", sees: "Sign you in with a private ID made only for this platform", gives: "A private ID for this person, different from the one every other platform gets", always: true },
  { scope: "email", sees: "An email address to reach you, real or private (you choose below)", gives: "A working email address: the person's real one, or a private relay address" },
  { scope: "mq.name", sees: "See the name you chose to show", gives: "The display name the person chose" },
  { scope: "mq.settings.prayer", sees: "Use your prayer settings", gives: "Location for prayer times, calculation method, ʿAṣr method, Hijri adjustment" },
  { scope: "mq.settings.language", sees: "Use your language", gives: "Preferred language and script" },
  { scope: "mq.record.learning", sees: "Add what you learn here to your record", gives: "Add lessons, courses, reading and gatherings to Learning" },
  { scope: "mq.record.practice", sees: "Add what you practise here to your record", gives: "Add acts to Practice" },
  { scope: "mq.record.reflection", sees: "Add your results here to your record", gives: "Add test results, as ranges, to Reflection" },
  { scope: "mq.record.import", sees: "Bring your past activity here into your record", gives: "A one-time permission to add the person's past history" },
];
// mq.circle is in the guide but not in phase 1 (PRD section 1: teacher circle ranges are not in phase 1).

export const SCOPE_NAMES = SCOPES.map((s) => s.scope);

export const NEVER_SEES = [
  "Your phone number or real name",
  "Which other platforms you use",
  "Anything another platform added to your record",
  "Your record itself. Only you see it",
];

export function scopeInfo(scope: string): ScopeInfo | undefined {
  return SCOPES.find((s) => s.scope === scope);
}

/** Splits a space-separated scope string, keeping only known scopes, in catalogue order. */
export function knownScopes(scope: string | string[]): string[] {
  const asked = new Set(Array.isArray(scope) ? scope : scope.split(" ").filter(Boolean));
  return SCOPE_NAMES.filter((s) => asked.has(s));
}
