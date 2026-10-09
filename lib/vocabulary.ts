// The entry vocabulary, version 1. Source: docs/PRD.md section 10 and docs/DEVELOPER_GUIDE.md,
// "Adding to a person's record". Any change here is a versioned change to both, with a date.

export const VOCABULARY_VERSION = 1;

export type EntryType = "learning" | "practice" | "reflection";

export const ACTIONS: Record<EntryType, readonly string[]> = {
  learning: ["lesson.completed", "course.started", "course.completed", "gathering.attended", "text.read", "verse.memorised"],
  practice: ["act.kept"],
  reflection: ["test.result"],
};

export const UNITS = ["page", "verse", "hadith", "minute"] as const;

/** The permission a platform needs to add each part. */
export const SCOPE_FOR: Record<EntryType, string> = {
  learning: "mq.record.learning",
  practice: "mq.record.practice",
  reflection: "mq.record.reflection",
};

const COMMON = ["vocabulary_version", "type", "action", "title", "occurred_at", "tz", "key"];
const FIELDS: Record<EntryType, string[]> = {
  learning: [...COMMON, "progress", "unit", "amount"],
  // amount is not accepted until TJ rules on whether Practice records counts (PRD decision 5).
  practice: COMMON,
  reflection: [...COMMON, "range"],
};

/** An entry that passed every check, ready to store. */
export type Entry = {
  type: EntryType;
  action: string;
  title: string;
  occurredAt: Date;
  tz: string;
  key: string;
  progress?: { done: number; of: number };
  unit?: (typeof UNITS)[number];
  amount?: number;
  range?: { low: number; high: number; of: number };
};

export class EntryError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Five minutes of clock difference is allowed; nothing later. */
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Checks one entry against the vocabulary. `version` is the vocabulary_version the platform
 * sent, either on the entry or once for a whole import.
 */
export function checkEntry(raw: unknown, now: Date = new Date(), version?: unknown): Entry {
  if (!isObject(raw)) throw new EntryError("entry", "Each entry must be a JSON object.");
  const v = raw.vocabulary_version ?? version;
  if (v !== VOCABULARY_VERSION) throw new EntryError("vocabulary_version", `vocabulary_version must be ${VOCABULARY_VERSION}.`);

  const type = raw.type;
  if (type !== "learning" && type !== "practice" && type !== "reflection") {
    throw new EntryError("type", "type must be learning, practice or reflection.");
  }
  const action = raw.action;
  if (typeof action !== "string" || !ACTIONS[type].includes(action)) {
    throw new EntryError("action", `Unknown action for ${type}. Allowed: ${ACTIONS[type].join(", ")}.`);
  }

  for (const k of Object.keys(raw)) {
    if (FIELDS[type].includes(k)) continue;
    if (k === "score" || k === "rank" || k === "percentile") {
      throw new EntryError(k, "A single score, a rank or a percentile is refused. Reflection results are sent as a range.");
    }
    if (type === "practice" && k === "amount") throw new EntryError("amount", "amount is not accepted for practice yet.");
    throw new EntryError(k, `${k} is not part of a ${type} entry.`);
  }

  const title = raw.title;
  if (typeof title !== "string" || !title.trim() || title.length > 200) {
    throw new EntryError("title", "title is required, up to 200 characters.");
  }

  const at = raw.occurred_at;
  if (typeof at !== "string" || !ISO.test(at) || Number.isNaN(Date.parse(at))) {
    throw new EntryError("occurred_at", "occurred_at must be a date and time in UTC, like 2026-10-05T14:20:00Z.");
  }
  const occurredAt = new Date(at);
  if (occurredAt.getTime() > now.getTime() + FUTURE_SLACK_MS) throw new EntryError("occurred_at", "occurred_at is in the future.");

  const tz = raw.tz;
  if (typeof tz !== "string" || !validTimeZone(tz)) throw new EntryError("tz", "tz must be a time zone name, like Asia/Kolkata.");

  const key = raw.key;
  if (typeof key !== "string" || !key.trim() || key.length > 200) {
    throw new EntryError("key", "key is required, up to 200 characters, and unique within your platform.");
  }

  const entry: Entry = { type, action, title: title.trim(), occurredAt, tz, key };

  if (raw.progress !== undefined) {
    const p = raw.progress;
    if (!isObject(p) || !isInt(p.done) || !isInt(p.of) || p.of < 1 || p.done < 0 || p.done > p.of || Object.keys(p).length !== 2) {
      throw new EntryError("progress", "progress must be { done, of }, whole numbers with done from 0 to of.");
    }
    entry.progress = { done: p.done, of: p.of };
  }

  if (raw.unit !== undefined || raw.amount !== undefined) {
    if (!UNITS.includes(raw.unit as (typeof UNITS)[number])) throw new EntryError("unit", `unit must be one of ${UNITS.join(", ")}, sent with amount.`);
    if (!isNum(raw.amount) || raw.amount <= 0 || raw.amount > 100_000) throw new EntryError("amount", "amount must be a number above 0, sent with unit.");
    entry.unit = raw.unit as (typeof UNITS)[number];
    entry.amount = raw.amount;
  }

  if (type === "reflection") {
    const r = raw.range;
    if (!isObject(r) || !isNum(r.low) || !isNum(r.high) || !isNum(r.of) || Object.keys(r).length !== 3) {
      throw new EntryError("range", "A reflection result needs range { low, high, of }. A single score is refused.");
    }
    if (!(r.of > 0 && r.low >= 0 && r.low < r.high && r.high <= r.of)) {
      throw new EntryError("range", "range must have 0 <= low < high <= of. A single score is refused.");
    }
    entry.range = { low: r.low, high: r.high, of: r.of };
  }

  return entry;
}
