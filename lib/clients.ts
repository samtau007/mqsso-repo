import { audit } from "./audit";
import { decrypt, encrypt, secret, token } from "./crypto";
import { one, query } from "./db";
import { SCOPE_NAMES } from "./scopes";

export type ClientType = "server" | "public";
export type SendsFrom = "server" | "devices" | "both";

export type Platform = {
  clientId: string;
  name: string;
  website: string;
  description: string;
  redirectUris: string[];
  allowedScopes: string[];
  noticeUri: string | null;
  clientType: ClientType;
  sectorGroup: string;
  sendsFrom: SendsFrom;
  approved: boolean;
  ownerId: string;
  createdAt: Date;
  secretRotatedAt: Date | null;
};

type Row = {
  client_id: string; name: string; website: string; description: string; redirect_uris: string[];
  allowed_scopes: string[]; notice_uri: string | null; client_type: ClientType; client_secret_enc: string | null;
  signing_secret_enc: string | null; sector_group: string; sends_from: SendsFrom; approved: boolean; owner_id: string;
  created_at: Date; secret_rotated_at: Date | null;
};

const toPlatform = (r: Row): Platform => ({
  clientId: r.client_id, name: r.name, website: r.website, description: r.description, redirectUris: r.redirect_uris,
  allowedScopes: r.allowed_scopes, noticeUri: r.notice_uri, clientType: r.client_type, sectorGroup: r.sector_group,
  sendsFrom: r.sends_from, approved: r.approved, ownerId: r.owner_id, createdAt: r.created_at, secretRotatedAt: r.secret_rotated_at,
});

export type PlatformInput = {
  name: string;
  website: string;
  description: string;
  redirectUris: string[];
  noticeUri: string;
  clientType: ClientType;
  sendsFrom: SendsFrom;
  scopes: string[];
};

export type Issued = { clientId: string; clientSecret: string | null; signingSecret: string | null };

export class InputError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(" "));
  }
}

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(s: string): URL | undefined {
  try {
    return new URL(s);
  } catch {
    return undefined;
  }
}

/** https everywhere, except http on this machine while developing. */
function secureEnough(u: URL): boolean {
  return u.protocol === "https:" || (u.protocol === "http:" && LOCAL.has(u.hostname));
}

export function validatePlatform(input: PlatformInput): string[] {
  const p: string[] = [];
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) p.push("Give a name between 2 and 80 characters.");

  const site = parseUrl(input.website.trim());
  if (!site || !secureEnough(site)) p.push("The website must be a full https address.");

  const desc = input.description.trim();
  if (desc.length < 10 || desc.length > 500) p.push("Describe the platform in 10 to 500 characters.");

  if (!["server", "public"].includes(input.clientType)) p.push("Choose how the platform signs in.");
  if (!["server", "devices", "both"].includes(input.sendsFrom)) p.push("Choose where entries are sent from.");

  const uris = input.redirectUris.map((s) => s.trim()).filter(Boolean);
  if (!uris.length) p.push("Add at least one redirect address.");
  if (uris.length > 10) p.push("Add at most 10 redirect addresses.");
  const hosts = new Set<string>();
  for (const s of uris) {
    const u = parseUrl(s);
    if (!u) { p.push(`${s} is not a full address.`); continue; }
    if (!secureEnough(u)) p.push(`${s} must use https.`);
    if (u.hash) p.push(`${s} must not contain #.`);
    hosts.add(u.host);
  }
  // Private IDs are worked out from the redirect host. Different hosts need a separate registration.
  if (hosts.size > 1) p.push("All redirect addresses must be on the same host. Register a separate platform for each host.");

  const notice = input.noticeUri.trim();
  if (notice) {
    const u = parseUrl(notice);
    if (!u || !secureEnough(u)) p.push("The notice address must be a full https address.");
  } else if (input.clientType === "server") {
    p.push("Add the notice address where we send disconnect and delete notices.");
  }

  if (!input.scopes.includes("openid")) p.push("openid is always included.");
  for (const s of input.scopes) if (!SCOPE_NAMES.includes(s)) p.push(`${s} is not a permission we offer.`);
  return p;
}

function newClientId() {
  return `mqc_${token(20)}`;
}

/** Registers a platform. Secrets are returned once here and never shown again. */
export async function registerPlatform(input: PlatformInput, ownerId: string): Promise<Issued> {
  const problems = validatePlatform(input);
  if (problems.length) throw new InputError(problems);

  const clientId = newClientId();
  const clientSecret = input.clientType === "server" ? `mqs_${secret()}` : null;
  const signingSecret = input.noticeUri.trim() ? `mqn_${secret()}` : null;
  const scopes = SCOPE_NAMES.filter((s) => input.scopes.includes(s));

  await query(
    `insert into clients (client_id, name, website, description, redirect_uris, allowed_scopes, notice_uri, client_type,
       client_secret_enc, signing_secret_enc, sector_group, sends_from, owner_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      clientId, input.name.trim(), input.website.trim(), input.description.trim(),
      input.redirectUris.map((s) => s.trim()).filter(Boolean), scopes, input.noticeUri.trim() || null, input.clientType,
      clientSecret && encrypt(clientSecret), signingSecret && encrypt(signingSecret),
      // Every platform starts in its own sector group. Only an admin can put platforms together.
      clientId, input.sendsFrom, ownerId,
    ],
  );
  await audit({ actor: `developer:${ownerId}`, action: "client.registered", clientId });
  return { clientId, clientSecret, signingSecret };
}

export async function getPlatform(clientId: string): Promise<Platform | undefined> {
  const r = await one<Row>("select * from clients where client_id = $1", [clientId]);
  return r && toPlatform(r);
}

export async function listPlatforms(ownerId: string | null): Promise<Platform[]> {
  const r = ownerId
    ? await query<Row>("select * from clients where owner_id = $1 order by created_at", [ownerId])
    : await query<Row>("select * from clients order by created_at");
  return r.rows.map(toPlatform);
}

/** New client secret and notice signing secret. The old ones stop working at once. */
export async function rotateSecrets(clientId: string, actor: string): Promise<Issued> {
  const p = await getPlatform(clientId);
  if (!p) throw new Error("Unknown platform");
  const clientSecret = p.clientType === "server" ? `mqs_${secret()}` : null;
  const signingSecret = p.noticeUri ? `mqn_${secret()}` : null;
  await query(
    "update clients set client_secret_enc = $2, signing_secret_enc = $3, secret_rotated_at = now() where client_id = $1",
    [clientId, clientSecret && encrypt(clientSecret), signingSecret && encrypt(signingSecret)],
  );
  await audit({ actor, action: "client.secret_rotated", clientId });
  return { clientId, clientSecret, signingSecret };
}

export async function setApproved(clientId: string, approved: boolean, actor: string) {
  await query("update clients set approved = $2 where client_id = $1", [clientId, approved]);
  await audit({ actor, action: approved ? "client.approved" : "client.unapproved", clientId });
}

export async function setSectorGroup(clientId: string, group: string, actor: string) {
  const g = group.trim();
  if (!/^[a-z0-9_.-]{3,64}$/.test(g)) throw new InputError(["A sector group is 3 to 64 lowercase letters, digits, dots, dashes or underscores."]);
  // The group decides every private ID this platform has handed out. Once anyone has connected,
  // changing it would give those people new IDs and break their accounts on the platform.
  const used = await one("select 1 from connections where client_id = $1 limit 1", [clientId]);
  if (used) throw new InputError(["People have already connected to this platform, so its sector group can no longer change."]);
  await query("update clients set sector_group = $2 where client_id = $1", [clientId, g]);
  await audit({ actor, action: "client.sector_group_set", clientId, detail: { group: g } });
}

/**
 * Client metadata for node-oidc-provider. Only approved platforms can sign people in.
 * `mq_sector_group` decides which platforms share a private ID for a person.
 */
export async function oidcClientMetadata(clientId: string): Promise<Record<string, unknown> | undefined> {
  const r = await one<Row>("select * from clients where client_id = $1 and approved", [clientId]);
  if (!r) return undefined;
  const isPublic = r.client_type === "public";
  return {
    client_id: r.client_id,
    ...(isPublic ? {} : { client_secret: decrypt(r.client_secret_enc!) }),
    client_name: r.name,
    client_uri: r.website,
    redirect_uris: r.redirect_uris,
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: isPublic ? "none" : "client_secret_basic",
    subject_type: "pairwise",
    scope: r.allowed_scopes.join(" "),
    mq_sector_group: r.sector_group,
  };
}
