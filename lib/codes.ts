import { decrypt, emailIndex, encrypt, hmac, isEmail, normaliseEmail, safeEqual, sixDigitCode } from "./crypto";
import { one, query } from "./db";
import { env } from "./env";
import { codeEmail, sendMail } from "./mail";

export const CODES_PER_HOUR = 5;
export const CODE_MINUTES = 10;
export const CODE_ATTEMPTS = 5;

export type Purpose = "signin" | "portal";

export class CodeError extends Error {
  constructor(public reason: "bad_email" | "rate_limited" | "no_code" | "expired" | "too_many_attempts" | "wrong_code") {
    super(reason);
  }
}

function codeHash(flowId: string, code: string) {
  return hmac(env.indexKey, `code:${flowId}:${code}`);
}

/**
 * Sends a 6-digit code to `email` for one sign-in flow (an interaction id, or a portal flow id).
 * At most 5 codes an hour per email address, across every flow.
 */
export async function issueCode(purpose: Purpose, flowId: string, rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  if (!isEmail(email)) throw new CodeError("bad_email");
  const index = emailIndex(email);

  const recent = await one<{ n: string }>(
    "select count(*) as n from login_codes where email_index = $1 and created_at > now() - interval '1 hour'",
    [index],
  );
  if (Number(recent?.n ?? 0) >= CODES_PER_HOUR) throw new CodeError("rate_limited");

  const code = sixDigitCode();
  await query(
    `insert into login_codes (purpose, email_index, email_ciphertext, code_hash, flow_id, expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`,
    [purpose, index, encrypt(email), codeHash(flowId, code), flowId, CODE_MINUTES],
  );
  await sendMail({ ...codeEmail(code, purpose), to: email });
}

/** The email waiting for a code in this flow, if any. Shown back to the person as "we sent a code to ...". */
export async function pendingEmail(purpose: Purpose, flowId: string): Promise<string | undefined> {
  const r = await one<{ email_ciphertext: string }>(
    "select email_ciphertext from login_codes where purpose = $1 and flow_id = $2 and used_at is null order by created_at desc limit 1",
    [purpose, flowId],
  );
  return r && decrypt(r.email_ciphertext);
}

/** Checks the latest code for this flow. Returns the verified email. */
export async function verifyCode(purpose: Purpose, flowId: string, code: string): Promise<string> {
  const row = await one<{ id: string; code_hash: string; email_ciphertext: string; attempts: number; expired: boolean }>(
    `select id, code_hash, email_ciphertext, attempts, expires_at < now() as expired
       from login_codes where purpose = $1 and flow_id = $2 and used_at is null
      order by created_at desc limit 1`,
    [purpose, flowId],
  );
  if (!row) throw new CodeError("no_code");
  if (row.expired) throw new CodeError("expired");
  if (row.attempts >= CODE_ATTEMPTS) throw new CodeError("too_many_attempts");

  await query("update login_codes set attempts = attempts + 1 where id = $1", [row.id]);
  if (!/^\d{6}$/.test(code) || !safeEqual(codeHash(flowId, code), row.code_hash)) throw new CodeError("wrong_code");

  const used = await query("update login_codes set used_at = now() where id = $1 and used_at is null", [row.id]);
  if (!used.rowCount) throw new CodeError("no_code");
  return decrypt(row.email_ciphertext);
}

export function codeErrorMessage(e: unknown): string {
  const reason = e instanceof CodeError ? e.reason : "";
  switch (reason) {
    case "bad_email": return "Check the email address and try again.";
    case "rate_limited": return "Too many codes were sent to this address. Please wait an hour and try again.";
    case "no_code": return "Ask for a new code and try again.";
    case "expired": return "That code has expired. Ask for a new one.";
    case "too_many_attempts": return "Too many tries. Ask for a new code.";
    case "wrong_code": return "That code did not match. Check the latest email and try again.";
    default: return "Something went wrong. Please try again.";
  }
}
