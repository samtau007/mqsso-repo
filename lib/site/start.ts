import { NextResponse } from "next/server";
import { oidc, redirectUri, siteConfig } from "./oidc";
import { savePending } from "./session";

/** Sends the person to Muslim Quotient to sign in or create their ID, with PKCE and state. */
export async function startSignIn(): Promise<NextResponse> {
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
