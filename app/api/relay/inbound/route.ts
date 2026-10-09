import { relayEnabled, relayInbound, webhookVerified, type Webhook } from "@/lib/relay";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Resend's email.received webhook for relay.muslimquotient.com. Resend retries on anything but
 * 2xx, so a message we decided to drop still answers 200.
 */
export async function POST(request: Request) {
  if (!relayEnabled()) return new Response("Relay not set up", { status: 503 });
  const body = await request.text();
  if (!webhookVerified(request.headers, body)) return new Response("Unauthorised", { status: 401 });
  let hook: Webhook;
  try {
    hook = JSON.parse(body) as Webhook;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const outcomes = await relayInbound(hook);
  // A retry helps only when Resend could not give us the message, or forwarding failed.
  if (!outcomes) return new Response("Message not available yet", { status: 502 });
  if (outcomes.some((o) => o.result === "failed")) return Response.json({ outcomes }, { status: 502 });
  return Response.json({ outcomes });
}
