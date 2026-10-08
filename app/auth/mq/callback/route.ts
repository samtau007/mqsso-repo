import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { oidc, redirectUri, siteConfig } from "@/lib/site/oidc";
import { startSession, takePending } from "@/lib/site/session";

export const dynamic = "force-dynamic";

// Exchanges the one-time code on the server, with PKCE, exactly as the developer guide says.
export async function GET(request: NextRequest) {
  const pending = takePending();
  const back = (why: string) => NextResponse.redirect(`${env.siteOrigin}/?signin=${why}`, 303);
  if (!pending) return back("expired");
  if (request.nextUrl.searchParams.get("error") === "access_denied") return back("cancelled");

  // Rebuild the callback address on our public origin; behind the proxy request.url may differ.
  const current = new URL(redirectUri());
  current.search = request.nextUrl.search;
  try {
    const config = await siteConfig();
    const tokens = await oidc.authorizationCodeGrant(config, current, {
      pkceCodeVerifier: pending.verifier,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
    });
    const sub = tokens.claims()?.sub;
    if (!sub) return back("failed");
    startSession(sub);
  } catch {
    return back("failed");
  }
  return NextResponse.redirect(`${env.siteOrigin}/dashboard`, 303);
}
