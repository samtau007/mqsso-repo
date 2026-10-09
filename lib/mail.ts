import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

type Mail = { to: string; subject: string; text: string };

/**
 * Sends a plain-text email through Resend. Plain text only, so there is nothing to carry
 * open or click tracking. Without RESEND_API_KEY (development) the email goes to the log,
 * or to MQ_MAIL_OUTBOX when tests set it.
 */
export async function sendMail(m: Mail): Promise<void> {
  if (env.mailOutbox) {
    await mkdir(env.mailOutbox, { recursive: true });
    const file = path.join(env.mailOutbox, `${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(file, JSON.stringify(m));
    return;
  }
  if (!env.resendApiKey) {
    if (env.isProduction) throw new Error("RESEND_API_KEY is not set");
    console.log(`[mail] to ${m.to}: ${m.subject}\n${m.text}`);
    return;
  }
  const r = await fetch(`${env.resendApiBase}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.mailFrom, to: [m.to], subject: m.subject, text: m.text }),
  });
  if (!r.ok) throw new Error(`Email was not sent (${r.status})`);
}

export function codeEmail(code: string, purpose: "signin" | "portal" | "merge"): Omit<Mail, "to"> {
  if (purpose === "merge") {
    return {
      subject: `${code} is your Muslim Quotient code`,
      text: [
        `Someone signed in to Muslim Quotient asked to merge the account that uses this email into theirs. The code is ${code}`,
        "",
        "Only give it if that was you: merging moves everything from this account into the other one, and deletes this one.",
        "It works for 10 minutes. If you did not ask for it, you can ignore this email.",
        "",
        "Muslim Quotient",
      ].join("\n"),
    };
  }
  const where = purpose === "portal" ? "the Muslim Quotient developer portal" : "Muslim Quotient";
  return {
    subject: `${code} is your Muslim Quotient code`,
    text: [
      `Your code for ${where} is ${code}`,
      "",
      "It works for 10 minutes. If you did not ask for it, you can ignore this email.",
      "",
      "Muslim Quotient",
    ].join("\n"),
  };
}
