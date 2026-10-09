import { afterEach, describe, expect, it } from "vitest";
import { deliverable, retryDelayMs, signNotice, verifyNotice } from "@/lib/notices";

const body = '{"id":"n1","event":"connection.revoked","sub":"mq_abc","at":"2026-10-09T08:00:00Z"}';
const secret = "mqn_test_secret";

describe("notice signatures", () => {
  it("verify with the right secret, body and time", () => {
    const t = 1_791_500_000;
    const header = signNotice(body, secret, t);
    expect(header).toMatch(/^t=1791500000,v1=[0-9a-f]{64}$/);
    expect(verifyNotice(body, header, secret, t + 60)).toBe(true);
  });

  it("fail with another secret, a changed body, or an old time", () => {
    const t = 1_791_500_000;
    const header = signNotice(body, secret, t);
    expect(verifyNotice(body, header, "mqn_other", t)).toBe(false);
    expect(verifyNotice(body.replace("revoked", "deleted"), header, secret, t)).toBe(false);
    expect(verifyNotice(body, header, secret, t + 301)).toBe(false);
    expect(verifyNotice(body, "v1=abc", secret, t)).toBe(false);
  });
});

describe("notice delivery", () => {
  afterEach(() => {
    delete process.env.MQ_ALLOW_LOCAL_NOTICES;
  });

  it("goes only to public https addresses", () => {
    expect(deliverable("https://platform.example/api/mq/notices")).toBe(true);
    for (const a of ["http://platform.example/n", "https://localhost/n", "https://id.mq.localhost/n", "https://127.0.0.1/n", "https://10.0.0.5/n", "https://192.168.1.2/n", "https://169.254.169.254/latest", "https://[::1]/n", "not a url"]) {
      expect(deliverable(a), a).toBe(false);
    }
    process.env.MQ_ALLOW_LOCAL_NOTICES = "1";
    expect(deliverable("http://127.0.0.1:3106/n")).toBe(true);
  });

  it("backs off from a minute to at most a day", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(30)).toBe(86_400_000);
  });
});
