import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { parseAddress, webhookVerified } from "@/lib/relay";

// Svix's published example, which Resend's webhooks follow.
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const T = 1614265330;
const BODY = '{"test": 2432232314}';
const SIG = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";

const headers = (sig: string, t = T, id = ID) => new Headers({ "svix-id": id, "svix-timestamp": String(t), "svix-signature": sig });

describe("Resend webhook signatures", () => {
  afterEach(() => { delete process.env.RESEND_RELAY_WEBHOOK_SECRET; });

  it("verify Svix's own example", () => {
    process.env.RESEND_RELAY_WEBHOOK_SECRET = SECRET;
    expect(webhookVerified(headers(SIG), BODY, T * 1000)).toBe(true);
    // Several signatures during a secret change: one good one is enough.
    expect(webhookVerified(headers(`v1,AAAA ${SIG}`), BODY, T * 1000)).toBe(true);
  });

  it("fail on a changed body, another id, an old time, or no secret", () => {
    process.env.RESEND_RELAY_WEBHOOK_SECRET = SECRET;
    expect(webhookVerified(headers(SIG), BODY.replace("2", "3"), T * 1000)).toBe(false);
    expect(webhookVerified(headers(SIG, T, "msg_other"), BODY, T * 1000)).toBe(false);
    expect(webhookVerified(headers(SIG), BODY, (T + 301) * 1000)).toBe(false);
    const forged = createHmac("sha256", "guess").update(`${ID}.${T}.${BODY}`).digest("base64");
    expect(webhookVerified(headers(`v1,${forged}`), BODY, T * 1000)).toBe(false);
    delete process.env.RESEND_RELAY_WEBHOOK_SECRET;
    expect(webhookVerified(headers(SIG), BODY, T * 1000)).toBe(false);
  });
});

describe("addresses", () => {
  it("split a name from the address", () => {
    expect(parseAddress("Halaqa Notes <hello@halaqa.example>")).toEqual({ name: "Halaqa Notes", email: "hello@halaqa.example" });
    expect(parseAddress('"Notes, Halaqa" <hello@halaqa.example>')).toEqual({ name: "Notes, Halaqa", email: "hello@halaqa.example" });
    expect(parseAddress("hello@halaqa.example")).toEqual({ name: "", email: "hello@halaqa.example" });
  });
});
