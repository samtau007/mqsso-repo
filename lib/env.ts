// Server configuration, read once. Every value is documented in .env.example.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. See .env.example.`);
  return v;
}

function origin(name: string, fallback: string): string {
  return (process.env[name] || fallback).replace(/\/$/, "");
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },

  /** Public addresses. The issuer is the sign-in service's own address. */
  get idOrigin() { return origin("MQ_ID_ORIGIN", "https://id.muslimquotient.com"); },
  get siteOrigin() { return origin("MQ_SITE_ORIGIN", "https://muslimquotient.com"); },
  get developersOrigin() { return origin("MQ_DEVELOPERS_ORIGIN", "https://developers.muslimquotient.com"); },
  get relayDomain() { return process.env.MQ_RELAY_DOMAIN || "relay.muslimquotient.com"; },

  /** 32-byte keys, base64. Vault key encrypts email and client secrets; index key hashes email for lookup. */
  get vaultKey() { return Buffer.from(required("MQ_VAULT_KEY"), "base64"); },
  get indexKey() { return Buffer.from(required("MQ_INDEX_KEY"), "base64"); },
  /** Secret behind every pairwise private ID. Changing it changes every ID, so it is never rotated. */
  get pairwiseSalt() { return required("MQ_PAIRWISE_SALT"); },
  /** Signs the developer portal session cookie. */
  get sessionKey() { return Buffer.from(required("MQ_SESSION_KEY"), "base64"); },

  /** Signing keys for ID tokens (a JWKS with private keys) and cookie signing keys. */
  get jwks() { return JSON.parse(required("MQ_JWKS")) as { keys: Record<string, unknown>[] }; },
  get cookieKeys() { return required("MQ_COOKIE_KEYS").split(",").map((s) => s.trim()).filter(Boolean); },

  /** Login code email. Without a key, codes are written to the server log (development only). */
  get resendApiKey() { return process.env.RESEND_API_KEY || ""; },
  get mailFrom() { return process.env.MQ_MAIL_FROM || "Muslim Quotient <codes@id.muslimquotient.com>"; },
  /** Test runs only: a directory where each outgoing email is written as a JSON file. */
  get mailOutbox() { return process.env.MQ_MAIL_OUTBOX || ""; },

  /** Developer portal accounts allowed to approve platforms and set sector groups. */
  get portalAdmins() {
    return (process.env.MQ_PORTAL_ADMINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  },

  /** Protects scheduled jobs such as the given-name rotation. */
  get cronSecret() { return required("CRON_SECRET"); },

  get isProduction() { return process.env.NODE_ENV === "production"; },
};

export function hostOf(url: string): string {
  return new URL(url).host;
}
