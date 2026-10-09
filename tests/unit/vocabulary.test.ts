import { describe, expect, it } from "vitest";
import { checkEntry, EntryError } from "@/lib/vocabulary";

const now = new Date("2026-10-08T12:00:00Z");
const base = { vocabulary_version: 1, title: "Daily istighfar kept", occurred_at: "2026-10-07T18:00:00Z", tz: "Asia/Kolkata", key: "day-2026-10-07" };
const practice = { ...base, type: "practice", action: "act.kept" };
const reflection = { ...base, type: "reflection", action: "test.result", title: "Worship", range: { low: 4, high: 5, of: 10 } };

function refused(entry: unknown, field: string) {
  try {
    checkEntry(entry, now);
  } catch (e) {
    expect(e).toBeInstanceOf(EntryError);
    expect((e as EntryError).field).toBe(field);
    return (e as EntryError).message;
  }
  throw new Error("accepted");
}

describe("entry vocabulary, version 1", () => {
  it("accepts the guide's examples", () => {
    const l = checkEntry({ ...base, type: "learning", action: "lesson.completed", title: "Tajwid, lesson 8: Qalqalah", progress: { done: 8, of: 20 }, key: "lesson-1188" }, now);
    expect(l.progress).toEqual({ done: 8, of: 20 });
    expect(checkEntry(reflection, now).range).toEqual({ low: 4, high: 5, of: 10 });
    const p = checkEntry(practice, now);
    expect(p.occurredAt.toISOString()).toBe("2026-10-07T18:00:00.000Z");
  });

  it("refuses unknown actions and types", () => {
    expect(refused({ ...practice, action: "act.counted" }, "action")).toMatch(/Allowed: act.kept/);
    refused({ ...practice, type: "worship" }, "type");
  });

  it("refuses the wrong vocabulary version, and takes the import's version", () => {
    refused({ ...practice, vocabulary_version: 2 }, "vocabulary_version");
    const { vocabulary_version: _, ...bare } = practice;
    refused(bare, "vocabulary_version");
    expect(checkEntry(bare, now, 1).type).toBe("practice");
  });

  it("refuses a reflection without a range, and any single score or rank", () => {
    const { range: _, ...noRange } = reflection;
    refused(noRange, "range");
    refused({ ...reflection, range: { low: 5, high: 5, of: 10 } }, "range");
    refused({ ...reflection, range: { low: 4, high: 11, of: 10 } }, "range");
    refused({ ...reflection, score: 4 }, "score");
    refused({ ...reflection, percentile: 80 }, "percentile");
    refused({ ...reflection, rank: 3 }, "rank");
  });

  it("does not take counts for practice yet", () => {
    refused({ ...practice, amount: 100 }, "amount");
  });

  it("checks dates, time zones and keys", () => {
    refused({ ...practice, occurred_at: "2026-10-07" }, "occurred_at");
    refused({ ...practice, occurred_at: "2026-10-09T12:00:00Z" }, "occurred_at");
    refused({ ...practice, tz: "India" }, "tz");
    refused({ ...practice, key: "" }, "key");
    refused({ ...practice, title: "  " }, "title");
  });

  it("keeps fields to their part", () => {
    refused({ ...practice, range: { low: 1, high: 2, of: 3 } }, "range");
    refused({ ...base, type: "learning", action: "text.read", unit: "page" }, "amount");
    refused({ ...base, type: "learning", action: "text.read", progress: { done: 3, of: 2 } }, "progress");
    expect(checkEntry({ ...base, type: "learning", action: "text.read", unit: "page", amount: 4 }, now).amount).toBe(4);
  });
});
