import { NextResponse } from "next/server";
import { oidc, redirectUri, siteConfig } from "./oidc";
import { savePending } from "./session";

const notOpen = () =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Muslim Quotient</title>
<style>body{margin:0;background:#0c121d;color:#fff;font-family:Outfit,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
main{max-width:420px;background:#18212f;border:1px solid #2c3a52;border-radius:22px;padding:28px}h1{margin:0;font-size:24px;font-weight:600}p{color:#9dadc6}a{color:#c9b6dc}</style></head>
<body><main><h1>Sign-up opens soon</h1><p>Muslim Quotient sign-in is being set up. Please try again a little later.</p><p><a href="/">Back to the start</a></p></main></body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "3600" } },
  );

/** Sends the person to Muslim Quotient to sign in or create their ID, with PKCE and state. */
export async function startSignIn(): Promise<NextResponse> {
  // Until muslimquotient.com is registered in the developer portal, say so plainly instead of failing.
  if (!process.env.MQ_SITE_CLIENT_ID || !process.env.MQ_SITE_CLIENT_SECRET) return notOpen();
  const config = await siteConfig();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  savePending({ verifier, state, nonce });
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: "openid",
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return NextResponse.redirect(url.href, 303);
}
