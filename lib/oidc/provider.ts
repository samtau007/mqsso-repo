import Provider, { type Configuration, type KoaContextWithOIDC } from "oidc-provider";
import { getConnection, subFor } from "../connections";
import { env } from "../env";
import { getPerson, realEmail } from "../people";
import { SCOPE_NAMES } from "../scopes";
import { PostgresAdapter } from "./adapter";
import { errorPage } from "./pages";

const DAY = 24 * 60 * 60;

/** The sector group a client belongs to. Our three products share one; every other platform has its own. */
export function sectorGroupOf(client: { metadata(): Record<string, unknown> }): string {
  const g = client.metadata().mq_sector_group;
  if (typeof g !== "string" || !g) throw new Error("Client has no sector group");
  return g;
}

function configuration(): Configuration {
  return {
    adapter: PostgresAdapter,
    clients: [],

    async findAccount(ctx: KoaContextWithOIDC, id: string) {
      const person = await getPerson(id);
      if (!person) return undefined;
      return {
        accountId: id,
        async claims(_use: string, scope: string) {
          const scopes = new Set(scope.split(" "));
          const out: { sub: string; [claim: string]: unknown } = { sub: id };
          const client = ctx.oidc.client;
          if (client && scopes.has("email")) {
            const conn = await getConnection(id, client.clientId);
            if (conn?.emailChoice === "hide" && conn.relayAddress) {
              out.email = conn.relayAddress;
              out.email_verified = true;
            } else if (conn?.emailChoice === "share") {
              out.email = await realEmail(id);
              out.email_verified = true;
            }
          }
          // Open decision (guide, "Still to decide"): whether mq.name is offered at all, and what it holds.
          // Until then it carries the person's current given name, never a real name.
          if (scopes.has("mq.name")) out.name = person.givenName;
          return out;
        },
      };
    },

    claims: {
      openid: ["sub"],
      email: ["email", "email_verified"],
      "mq.name": ["name"],
    },
    scopes: SCOPE_NAMES,
    // The ID token carries the allowed claims directly, as the developer guide shows.
    conformIdTokenClaims: false,

    responseTypes: ["code"],
    pkce: { required: () => true },
    subjectTypes: ["pairwise"],
    extraClientMetadata: { properties: ["mq_sector_group"] },
    async pairwiseIdentifier(_ctx, accountId, client) {
      return subFor(accountId, client.clientId, sectorGroupOf(client));
    },

    /**
     * What the person already allowed a platform is kept in connections, so signing in on a new
     * device does not ask again. The permission screen shows only when the platform asks for
     * something the person has not allowed it.
     */
    async loadExistingGrant(ctx) {
      const p = ctx.oidc.provider;
      const clientId = ctx.oidc.client!.clientId;
      const grantId = ctx.oidc.result?.consent?.grantId || ctx.oidc.session!.grantIdFor(clientId);
      if (grantId) return p.Grant.find(grantId);
      const accountId = ctx.oidc.session!.accountId;
      if (!accountId) return undefined;
      const conn = await getConnection(accountId, clientId);
      if (!conn) return undefined;
      const grant = new p.Grant({ accountId, clientId });
      grant.addOIDCScope(conn.scopes.join(" "));
      await grant.save();
      ctx.oidc.session!.grantIdFor(clientId, grant.jti);
      return grant;
    },

    // Every client that may use refresh tokens gets one, and it is replaced on every use.
    async issueRefreshToken(_ctx, client) {
      return client.grantTypeAllowed("refresh_token");
    },
    rotateRefreshToken: () => true,
    expiresWithSession: async () => false,

    // Grant and RefreshToken have no expiry: see provider() below.
    ttl: {
      AccessToken: 60 * 60,
      AuthorizationCode: 60,
      IdToken: 60 * 60,
      Interaction: 60 * 60,
      Session: 14 * DAY,
    },

    cookies: {
      keys: env.cookieKeys,
      long: { signed: true, sameSite: "lax" },
      short: { signed: true, sameSite: "lax" },
    },
    jwks: env.jwks as Configuration["jwks"],

    routes: {
      authorization: "/authorize",
      token: "/token",
      userinfo: "/userinfo",
      jwks: "/jwks",
      revocation: "/token/revocation",
      end_session: "/session/end",
    },
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      userinfo: { enabled: true },
      rpInitiatedLogout: {
        enabled: true,
        async logoutSource(ctx, form) {
          ctx.body = errorPage("Sign out of Muslim Quotient", `<p>You will be signed out on this device.</p>${form}<button class="btn" form="op.logoutForm" name="logout" value="yes" type="submit">Sign out</button>`);
        },
        async postLogoutSuccessSource(ctx) {
          ctx.body = errorPage("Signed out", "<p>You are signed out of Muslim Quotient on this device.</p>");
        },
      },
    },
    // The Chrome extension (a public client) calls the token endpoint from its own origin.
    clientBasedCORS(_ctx, origin, client) {
      return client.clientAuthMethod === "none" && origin.startsWith("chrome-extension://");
    },

    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },

    async renderError(ctx, out) {
      ctx.type = "html";
      const unknownClient = out.error === "invalid_client" || out.error_description === "client is invalid";
      ctx.body = errorPage(
        "This sign-in could not continue",
        unknownClient
          ? "<p>This platform is not able to sign people in with Muslim Quotient yet.</p>"
          : `<p>${escapeHtml(String(out.error_description || out.error || "Something went wrong."))}</p>`,
      );
    },
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Global = typeof globalThis & { __mqProvider?: Provider };

export function provider(): Provider {
  const g = globalThis as Global;
  if (!g.__mqProvider) {
    const p = new Provider(env.idOrigin, configuration());
    // A connection lasts until the person disconnects or deletes their account (Sami, 9 October
    // 2026): no yearly reconnecting. node-oidc-provider fills in a default expiry when ttl is
    // left out, so the two models are told directly that they have none. A refresh token still
    // ends on use (rotation), on disconnect, and on deletion.
    for (const Model of [p.Grant, p.RefreshToken]) Object.defineProperty(Model, "expiresIn", { value: () => undefined });
    // Behind Vercel's proxy: trust X-Forwarded-Proto so cookies are marked secure.
    p.proxy = true;
    g.__mqProvider = p;
  }
  return g.__mqProvider;
}
