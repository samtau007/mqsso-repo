import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validatePlatform, type PlatformInput } from "@/lib/clients";
import { pairwiseSub } from "@/lib/connections";
import { decrypt, emailIndex, encrypt, isEmail, sixDigitCode } from "@/lib/crypto";
import { FIRST, SECOND, newGivenName, nextChange } from "@/lib/names";
import { knownScopes, SCOPES } from "@/lib/scopes";

const key = randomBytes(32);

describe("vault encryption", () => {
  it("round-trips and never contains the plain text", () => {
    const sealed = encrypt("person@example.com", key);
    expect(sealed).not.toContain("person");
    expect(decrypt(sealed, key)).toBe("person@example.com");
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("a@b.co", key)).not.toBe(encrypt("a@b.co", key));
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = encrypt("a@b.co", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("x").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
    expect(() => decrypt(sealed, randomBytes(32))).toThrow();
  });
});

describe("email index", () => {
  it("ignores case and spaces, and depends on the key", () => {
    expect(emailIndex(" Person@Example.com ", key)).toBe(emailIndex("person@example.com", key));
    expect(emailIndex("person@example.com", key)).not.toBe(emailIndex("person@example.com", randomBytes(32)));
  });

  it("checks addresses", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("not an email")).toBe(false);
  });
});

describe("codes", () => {
  it("are six digits", () => {
    for (let i = 0; i < 200; i++) expect(sixDigitCode()).toMatch(/^\d{6}$/);
  });
});

describe("pairwise private IDs", () => {
  const salt = "salt";
  it("are stable, opaque and differ between sector groups", () => {
    const a = pairwiseSub("muslimquotient", "person-1", salt);
    expect(a).toMatch(/^mq_[0-9a-f]{30}$/);
    expect(pairwiseSub("muslimquotient", "person-1", salt)).toBe(a);
    expect(pairwiseSub("mqc_other", "person-1", salt)).not.toBe(a);
    expect(pairwiseSub("muslimquotient", "person-2", salt)).not.toBe(a);
    expect(pairwiseSub("muslimquotient", "person-1", "other-salt")).not.toBe(a);
  });
});

describe("given names", () => {
  it("are two words and change when rotated", () => {
    for (let i = 0; i < 200; i++) {
      const n = newGivenName("Quiet Cedar");
      expect(n).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(n).not.toBe("Quiet Cedar");
    }
  });

  it("never use words that judge, compare or rank", () => {
    const banned = /streak|track|gamif|leader|rank|percentile|cohort|certif|licen|accredit|mark|best|top|first|last|winner|level|score|grade/i;
    for (const w of [...FIRST, ...SECOND]) expect(w).not.toMatch(banned);
  });

  it("change every 30 days", () => {
    const from = new Date("2026-10-08T00:00:00Z");
    expect(nextChange(from).toISOString()).toBe("2026-11-07T00:00:00.000Z");
  });
});

describe("scopes", () => {
  it("keeps only known scopes, in catalogue order", () => {
    expect(knownScopes("mq.record.learning email openid nonsense mq.circle")).toEqual(["openid", "email", "mq.record.learning"]);
  });

  it("words every permission for the person", () => {
    for (const s of SCOPES) expect(s.sees.length).toBeGreaterThan(5);
  });
});

describe("platform registration", () => {
  const ok: PlatformInput = {
    name: "Halaqa Notes",
    website: "https://halaqa.example",
    description: "Notes from weekly halaqas.",
    redirectUris: ["https://halaqa.example/auth/mq/callback"],
    noticeUri: "https://halaqa.example/api/mq/notices",
    clientType: "server",
    sendsFrom: "server",
    scopes: ["openid", "email"],
  };

  it("accepts a complete registration", () => {
    expect(validatePlatform(ok)).toEqual([]);
  });

  it("allows http only on this machine", () => {
    expect(validatePlatform({ ...ok, redirectUris: ["http://localhost:3000/cb"] })).toEqual([]);
    expect(validatePlatform({ ...ok, redirectUris: ["http://halaqa.example/cb"] }).join(" ")).toMatch(/https/);
  });

  it("needs every redirect address on one host", () => {
    const p = validatePlatform({ ...ok, redirectUris: ["https://a.example/cb", "https://b.example/cb"] });
    expect(p.join(" ")).toMatch(/same host/);
  });

  it("needs a notice address for server sign-in but not for an extension", () => {
    expect(validatePlatform({ ...ok, noticeUri: "" }).join(" ")).toMatch(/notice address/);
    expect(validatePlatform({ ...ok, noticeUri: "", clientType: "public", redirectUris: ["https://abc.chromiumapp.org/"] })).toEqual([]);
  });

  it("refuses unknown permissions, including mq.circle in phase 1", () => {
    expect(validatePlatform({ ...ok, scopes: ["openid", "mq.circle"] }).join(" ")).toMatch(/mq.circle/);
  });
});
