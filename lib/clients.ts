import { audit } from "./audit";
import { decrypt, emailIndex, encrypt, isEmail, normaliseEmail, secret, token } from "./crypto";
import { one, query, tx } from "./db";
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
  reviewRequestedAt: Date | null;
};

type Row = {
  client_id: string; name: string; website: string; description: string; redirect_uris: string[];
  allowed_scopes: string[]; notice_uri: string | null; client_type: ClientType; client_secret_enc: string | null;
  signing_secret_enc: string | null; sector_group: string; sends_from: SendsFrom; approved: boolean; owner_id: string;
  created_at: Date; secret_rotated_at: Date | null; review_requested_at: Date | null;
};

const toPlatform = (r: Row): Platform => ({
  clientId: r.client_id, name: r.name, website: r.website, description: r.description, redirectUris: r.redirect_uris,
  allowedScopes: r.allowed_scopes, noticeUri: r.notice_uri, clientType: r.client_type, sectorGroup: r.sector_group,
  sendsFrom: r.sends_from, approved: r.approved, ownerId: r.owner_id, createdAt: r.created_at, secretRotatedAt: r.secret_rotated_at, reviewRequestedAt: r.review_requested_at,
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

/** https everywhere, except http on this machine while developing (*.localhost is always this machine). */
function secureEnough(u: URL): boolean {
  return u.protocol === "https:" || (u.protocol === "http:" && (LOCAL.has(u.hostname) || u.hostname.endsWith(".localhost")));
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

/**
 * Going live clears test mode: every tester's sign-in, connection, import and entry from the
 * test period goes, so nothing from testing reaches a real record. Testers connect again.
 */
export async function setApproved(clientId: string, approved: boolean, actor: string) {
  await tx(async (c) => {
    if (approved) {
      // Testers are the only people a platform in test mode could sign in.
      const testers = (await c.query<{ person_id: string }>(
        `select v.person_id from platform_testers t join email_vault v on v.email_index = t.email_index where t.client_id = $1`,
        [clientId],
      )).rows.map((r) => r.person_id);
      const grants = await c.query<{ id: string }>(
        "select id from oidc_payloads where type = 'Grant' and payload->>'clientId' = $1 and payload->>'accountId' = any($2)",
        [clientId, testers],
      );
      const ids = grants.rows.map((g) => g.id);
      if (ids.length) {
        await c.query("delete from oidc_payloads where grant_id = any($1)", [ids]);
        await c.query("delete from oidc_payloads where type = 'Grant' and id = any($1)", [ids]);
      }
      const removed = await c.query("delete from entries where client_id = $1 and test", [clientId]);
      await c.query("delete from imports where client_id = $1 and person_id = any($2::uuid[])", [clientId, testers]);
      await c.query("delete from connections where client_id = $1 and person_id = any($2::uuid[])", [clientId, testers]);
      await audit({ actor, action: "client.approved", clientId, detail: { testEntriesRemoved: removed.rowCount } }, c);
    } else {
      await audit({ actor, action: "client.unapproved", clientId }, c);
    }
    await c.query("update clients set approved = $2, review_requested_at = case when $2 then null else review_requested_at end where client_id = $1", [clientId, approved]);
  });
}

export const MAX_TESTERS = 25;

export async function listTesters(clientId: string): Promise<{ email: string; addedAt: Date }[]> {
  // Testers are kept as an email index only; the portal shows what the developer typed, which
  // it keeps encrypted alongside.
  const r = await query<{ email_enc: string; added_at: Date }>(
    "select email_enc, added_at from platform_testers where client_id = $1 order by added_at",
    [clientId],
  );
  return r.rows.map((x) => ({ email: decrypt(x.email_enc), addedAt: x.added_at }));
}

export async function addTester(clientId: string, email: string, actor: string) {
  if (!isEmail(email)) throw new InputError(["Enter an email address."]);
  const n = await one<{ n: string }>("select count(*) as n from platform_testers where client_id = $1", [clientId]);
  if (Number(n!.n) >= MAX_TESTERS) throw new InputError([`Up to ${MAX_TESTERS} testers.`]);
  await query(
    "insert into platform_testers (client_id, email_index, email_enc) values ($1, $2, $3) on conflict do nothing",
    [clientId, emailIndex(email), encrypt(normaliseEmail(email))],
  );
  await audit({ actor, action: "client.tester_added", clientId });
}

/** Removing a tester also ends their test sign-in and drops what they sent in test mode. */
export async function removeTester(clientId: string, email: string, actor: string) {
  const index = emailIndex(email);
  await tx(async (c) => {
    await c.query("delete from platform_testers where client_id = $1 and email_index = $2", [clientId, index]);
    const p = await c.query<{ person_id: string }>("select person_id from email_vault where email_index = $1", [index]);
    const approved = (await c.query<{ approved: boolean }>("select approved from clients where client_id = $1", [clientId])).rows[0]?.approved;
    if (p.rows[0] && !approved) {
      const personId = p.rows[0].person_id;
      const grants = await c.query<{ id: string }>(
        "select id from oidc_payloads where type = 'Grant' and payload->>'clientId' = $1 and payload->>'accountId' = $2",
        [clientId, personId],
      );
      const ids = grants.rows.map((g) => g.id);
      if (ids.length) {
        await c.query("delete from oidc_payloads where grant_id = any($1)", [ids]);
        await c.query("delete from oidc_payloads where type = 'Grant' and id = any($1)", [ids]);
      }
      await c.query("delete from entries where client_id = $1 and person_id = $2 and test", [clientId, personId]);
      await c.query("delete from connections where client_id = $1 and person_id = $2", [clientId, personId]);
    }
    await audit({ actor, action: "client.tester_removed", clientId }, c);
  });
}

/** Whether this person may sign in to this platform: anyone, once approved; only testers before. */
export async function maySignIn(clientId: string, personId: string): Promise<boolean> {
  const r = await one<{ ok: boolean }>(
    `select cl.approved or exists (
       select 1 from platform_testers t join email_vault v on v.email_index = t.email_index
        where t.client_id = cl.client_id and v.person_id = $2) as ok
       from clients cl where cl.client_id = $1`,
    [clientId, personId],
  );
  return !!r?.ok;
}

/** The developer ticks the go-live checklist and asks for review; Muslim Quotient's admins are emailed. */
export async function requestReview(clientId: string, actor: string) {
  await query("update clients set review_requested_at = now() where client_id = $1 and not approved", [clientId]);
  await audit({ actor, action: "client.review_requested", clientId });
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
 * Client metadata for node-oidc-provider. An approved platform signs anyone in; one that is not
 * approved yet is in test mode and signs in only its testers (checked in the interaction).
 * `mq_sector_group` decides which platforms share a private ID for a person.
 */
export async function oidcClientMetadata(clientId: string): Promise<Record<string, unknown> | undefined> {
  const r = await one<Row>("select * from clients where client_id = $1", [clientId]);
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
    mq_test_mode: !r.approved,
  };
}

export type PlatformEdit = Omit<PlatformInput, "clientType" | "sendsFrom">;

/**
 * Changes a platform's details. Permissions can change only in test mode; a live platform asks
 * for review again to change them. Adding a notice address for the first time issues the notice
 * signing secret, returned once.
 */
export async function updatePlatform(clientId: string, edit: PlatformEdit, actor: string): Promise<{ signingSecret: string | null }> {
  const p = await getPlatform(clientId);
  if (!p) throw new InputError(["Unknown platform."]);
  const problems = validatePlatform({ ...edit, clientType: p.clientType, sendsFrom: p.sendsFrom });
  const scopes = SCOPE_NAMES.filter((s) => edit.scopes.includes(s));
  if (p.approved && scopes.join(" ") !== p.allowedScopes.join(" ")) {
    problems.push("Permissions of a live platform change only through review. Write to us from the portal.");
  }
  if (problems.length) throw new InputError(problems);

  const r = await one<{ signing_secret_enc: string | null }>("select signing_secret_enc from clients where client_id = $1", [clientId]);
  const signingSecret = edit.noticeUri.trim() && !r?.signing_secret_enc ? `mqn_${secret()}` : null;
  await query(
    `update clients set name = $2, website = $3, description = $4, redirect_uris = $5, notice_uri = $6, allowed_scopes = $7,
       signing_secret_enc = coalesce($8, signing_secret_enc)
     where client_id = $1`,
    [clientId, edit.name.trim(), edit.website.trim(), edit.description.trim(), edit.redirectUris.map((x) => x.trim()).filter(Boolean),
      edit.noticeUri.trim() || null, scopes, signingSecret && encrypt(signingSecret)],
  );
  await audit({ actor, action: "client.updated", clientId });
  return { signingSecret };
}

/** The go-live checklist, from the developer guide's "Testing and going live". */
export const CHECKLIST = [
  "Sign-in works with PKCE and checks state",
  "We store only the sub, and link and merge existing accounts as the guide describes",
  "We ask only for the permissions we use",
  "Entries use the right type, carry tz and key, and Reflection sends ranges only",
  "Our notice address checks signatures and handles all three notices",
  "We use the official button, unchanged",
  "Our privacy policy says what we send to Muslim Quotient",
];

