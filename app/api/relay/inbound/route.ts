import { inboundAuthorised, relayEnabled, relayInbound, type Inbound } from "@/lib/relay";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Postmark's inbound webhook for relay.muslimquotient.com. Postmark retries on anything but 2xx,
 * so a message we decided to drop still answers 200.
 */
export async function POST(request: Request) {
  if (!relayEnabled()) return new Response("Relay not set up", { status: 503 });
  if (!inboundAuthorised(request.headers.get("authorization"))) return new Response("Unauthorised", { status: 401 });
  const message = (await request.json().catch(() => null)) as Inbound | null;
  if (!message) return new Response("Bad request", { status: 400 });
  const outcomes = await relayInbound(message);
  // A Postmark retry helps only when forwarding itself failed.
  if (outcomes.some((o) => o.result === "failed")) return Response.json({ outcomes }, { status: 502 });
  return Response.json({ outcomes });
}
