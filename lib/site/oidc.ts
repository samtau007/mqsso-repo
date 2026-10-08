import * as oidc from "openid-client";
import { env } from "../env";

// muslimquotient.com signs people in exactly as the developer guide tells any platform to:
// a client registered in the developer portal, a standard OpenID Connect library, PKCE.

export function siteClient() {
  const clientId = process.env.MQ_SITE_CLIENT_ID;
  const clientSecret = process.env.MQ_SITE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("MQ_SITE_CLIENT_ID and MQ_SITE_CLIENT_SECRET are not set. Register muslimquotient.com in the developer portal.");
  return { clientId, clientSecret };
}

export const redirectUri = () => `${env.siteOrigin}/auth/mq/callback`;

/**
 * Development only: Node cannot resolve *.localhost, so requests to the sign-in service go to
 * 127.0.0.1 with the host in X-Forwarded-Host, which the middleware reads.
 */
const localFetch = ((url: string, options: RequestInit) => {
  const u = new URL(url);
  if (!u.hostname.endsWith(".localhost")) return fetch(u, options);
  const headers = new Headers(options.headers);
  headers.set("x-forwarded-host", u.host);
  u.hostname = "127.0.0.1";
  return fetch(u, { ...options, headers });
}) as unknown as oidc.CustomFetch;

type Global = typeof globalThis & { __mqSiteOidc?: Promise<oidc.Configuration> };

export function siteConfig(): Promise<oidc.Configuration> {
  const g = globalThis as Global;
  if (!g.__mqSiteOidc) {
    const { clientId, clientSecret } = siteClient();
    const issuer = new URL(env.idOrigin);
    const local = issuer.hostname.endsWith(".localhost");
    g.__mqSiteOidc = oidc.discovery(issuer, clientId, clientSecret, undefined, {
      ...(local ? { execute: [oidc.allowInsecureRequests], [oidc.customFetch]: localFetch } : {}),
    }).catch((e) => {
      g.__mqSiteOidc = undefined;
      throw e;
    });
  }
  return g.__mqSiteOidc;
}

export { oidc };
