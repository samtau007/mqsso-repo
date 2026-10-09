// Milestone 1, done when: a test platform registers in the portal, follows the developer guide,
// and signs a person in. Milestone 2, done when: sign up on muslimquotient.com works end to end.
// Milestone 3 (record service): a platform sends entries with the person's token, and they appear on the dashboard. Runs the built app (npm run build first) against a real Postgres.
//
//   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1/mq_test npm run test:e2e
//
// The database named in TEST_DATABASE_URL is wiped. Never point it at a real database.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, generateKeyPairSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import pg from "pg";
import * as oidc from "openid-client";
import { chromium } from "playwright-core";
import { migrate } from "../../scripts/migrate.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const PORT = 3100;
const DB = process.env.TEST_DATABASE_URL || "postgres://mq:mq@127.0.0.1/mq_test";
const ID = `http://id.localhost:${PORT}`;
const DEV = `http://developers.localhost:${PORT}`;
const API = `http://api.localhost:${PORT}`;
const SITE = `http://localhost:${PORT}`;
const OUTBOX = path.join(ROOT, ".mq-test", "outbox");
const ADMIN = "admin@example.com";
const PERSON = "person@example.com";
const CALLBACK_A = "http://localhost:3101/auth/mq/callback";
const CALLBACK_B = "http://127.0.0.1:3102/auth/mq/callback";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let server;
let browser;
let SECRETS;
const callbacks = new Map();
const callbackServers = [];

/** The test platforms' callback addresses: record what arrives, as a platform's route would. */
function startCallbackServer(port) {
  const srv = http.createServer((req, res) => {
    if (req.url !== "/favicon.ico") callbacks.set(port, `http://${req.headers.host}${req.url}`);
    res.end("callback");
  });
  callbackServers.push(srv);
  return new Promise((resolve) => srv.listen(port, resolve));
}
let page;

function secrets() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...privateKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" };
  const b64 = () => randomBytes(32).toString("base64");
  return {
    MQ_JWKS: JSON.stringify({ keys: [jwk] }),
    MQ_COOKIE_KEYS: randomBytes(32).toString("base64url"),
    MQ_VAULT_KEY: b64(), MQ_INDEX_KEY: b64(), MQ_SESSION_KEY: b64(),
    MQ_PAIRWISE_SALT: randomBytes(32).toString("base64url"),
    CRON_SECRET: "test-cron",
  };
}

async function resetDatabase() {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  // Clears only the test role's own schema, so this also works for the shared staging layout.
  await c.query(`do $$ declare r record; begin
    for r in select tablename from pg_tables where schemaname = current_schema() loop
      execute format('drop table if exists %I cascade', r.tablename);
    end loop;
    drop function if exists mq_current_person();
  end $$;`);
  await c.end();
  await migrate(DB);
}

/** Node cannot resolve *.localhost, so requests go to 127.0.0.1 with the host in X-Forwarded-Host. */
function localFetch(url, options = {}) {
  const u = new URL(url);
  const headers = new Headers(options.headers);
  if (u.hostname.endsWith(".localhost")) {
    headers.set("x-forwarded-host", u.host);
    u.hostname = "127.0.0.1";
  }
  return fetch(u, { ...options, headers });
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await localFetch(`${ID}/.well-known/openid-configuration`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
}

/** The newest code emailed to `to`. */
async function latestCode(to) {
  for (let i = 0; i < 50; i++) {
    const files = (await readdir(OUTBOX).catch(() => [])).sort().reverse();
    for (const f of files) {
      const m = JSON.parse(await readFile(path.join(OUTBOX, f), "utf8"));
      if (m.to === to) {
        const code = /\b(\d{6})\b/.exec(m.subject)?.[1];
        await rm(path.join(OUTBOX, f));
        return code;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no email to ${to}`);
}

/** Starts the built app. The same secrets every time, so restarts keep working with the data. */
async function startServer(extra = {}) {
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env, ...SECRETS,
      DATABASE_URL: DB,
      MQ_ID_ORIGIN: ID, MQ_DEVELOPERS_ORIGIN: DEV, MQ_API_ORIGIN: API, MQ_SITE_ORIGIN: SITE,
      MQ_MAIL_OUTBOX: OUTBOX, MQ_PORTAL_ADMINS: ADMIN, RESEND_API_KEY: "",
      // Notices go to the test platforms' servers on this machine.
      MQ_ALLOW_LOCAL_NOTICES: "1",
      ...extra,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForServer();
}

async function restartServer(extra) {
  process.kill(-server.pid, "SIGTERM");
  await new Promise((r) => server.once("exit", r));
  await startServer(extra);
}

before(async () => {
  await rm(path.join(ROOT, ".mq-test"), { recursive: true, force: true });
  await mkdir(OUTBOX, { recursive: true });
  await resetDatabase();
  SECRETS = secrets();
  await startServer();
  for (const port of [3101, 3102, 3103, 3104, 3105, 3107]) await startCallbackServer(port);
  browser = await chromium.launch({ executablePath: CHROMIUM });
  // CLAUDE.md: every screen must work at 360px wide.
  page = await browser.newPage({ viewport: { width: 360, height: 780 } });
});

after(async () => {
  await browser?.close();
  if (server) process.kill(-server.pid, "SIGTERM");
  for (const srv of callbackServers) {
    srv.closeAllConnections();
    srv.close();
  }
});

/** No sideways scrolling at 360px. Saves a screenshot to .mq-test for review. */
async function fitsNarrowScreen(name) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 360, `${name} is ${width}px wide at 360px`);
  await page.screenshot({ path: path.join(ROOT, ".mq-test", `${name}.png`), fullPage: true });
}

async function portalSignIn(email) {
  await page.goto(DEV);
  await page.fill("#email", email);
  await page.click("text=Send me a code");
  await page.waitForSelector("#code");
  await fitsNarrowScreen("portal-code");
  await page.fill("#code", await latestCode(email));
  await page.click("button:has-text('Sign in')");
  await page.waitForSelector("h1:has-text('Your platforms')");
  await page.waitForLoadState("networkidle");
}

async function registerPlatform({ name, website, redirect, notice, scopes = ["email", "mq.record.learning"] }) {
  await page.goto(`${DEV}/new`);
  await page.waitForSelector("#name", { timeout: 5000 }).catch(async (e) => {
    console.log(page.url(), (await page.content()).slice(0, 2000));
    throw e;
  });
  await fitsNarrowScreen("portal-register");
  await page.fill("#name", name);
  await page.fill("#website", website);
  await page.fill("#description", "A test platform for Muslim Quotient sign-in.");
  await page.fill("#redirect_uris", redirect);
  await page.fill("#notice_uri", notice);
  for (const scope of scopes) await page.check(`input[value='${scope}']`);
  await page.click("text=Register platform");
  await page.waitForSelector("[data-testid=client-secret]");
  return {
    clientId: await page.textContent("[data-testid=client-id]"),
    clientSecret: await page.textContent("[data-testid=client-secret]"),
    signingSecret: (await page.$("[data-testid=signing-secret]")) ? await page.textContent("[data-testid=signing-secret]") : null,
  };
}

async function approve(clientId) {
  await page.goto(`${DEV}/platforms/${clientId}`);
  await page.click("text=Approve platform");
  await page.waitForSelector("text=Withdraw approval");
}

async function setGroup(clientId, group) {
  await page.goto(`${DEV}/platforms/${clientId}`);
  await page.fill("#group", group);
  await page.click("text=Save group");
  await page.waitForSelector("text=Saved.");
}

/** What a platform does, straight from the developer guide, with a standard OIDC library. */
async function platform(clientId, clientSecret) {
  return oidc.discovery(new URL(ID), clientId, clientSecret, undefined, {
    execute: [oidc.allowInsecureRequests],
    [oidc.customFetch]: localFetch,
  });
}

/** Starts sign-in in the browser and returns the redirect the platform's callback receives. */
async function startSignIn(config, redirectUri, { pkce = true, scope = "openid email mq.record.learning" } = {}) {
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const params = { redirect_uri: redirectUri, scope, state };
  if (pkce) Object.assign(params, { code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256" });
  const url = oidc.buildAuthorizationUrl(config, params);

  const port = Number(new URL(redirectUri).port);
  callbacks.delete(port);
  return { url, verifier, state, callback: () => callbacks.get(port), cleanup: async () => callbacks.delete(port) };
}

const subs = {};

test("a platform registers in the portal and cannot sign anyone in before approval", async () => {
  await portalSignIn(ADMIN);
  const a = await registerPlatform({ name: "Halaqa Notes", website: "https://halaqa.example", redirect: CALLBACK_A, notice: "https://halaqa.example/api/mq/notices" });
  subs.a = a;
  assert.match(a.clientId, /^mqc_[a-z0-9]{20}$/);
  assert.match(a.clientSecret, /^mqs_/);

  const config = await platform(a.clientId, a.clientSecret).catch(() => null);
  const discovery = await (await localFetch(`${ID}/.well-known/openid-configuration`)).json();
  assert.equal(discovery.issuer, ID);
  assert.equal(discovery.authorization_endpoint, `${ID}/authorize`);
  assert.deepEqual(discovery.subject_types_supported, ["pairwise"]);
  assert.ok(discovery.code_challenge_methods_supported.includes("S256"));

  const s = await startSignIn(config, CALLBACK_A);
  await page.goto(s.url.href);
  await page.waitForSelector("text=not able to sign people in");
  await fitsNarrowScreen("id-not-approved");
  await s.cleanup();
});

test("rejects a sign-in without PKCE", async () => {
  await approve(subs.a.clientId);
  const config = await platform(subs.a.clientId, subs.a.clientSecret);
  const s = await startSignIn(config, CALLBACK_A, { pkce: false });
  await page.goto(s.url.href);
  await page.waitForTimeout(300);
  const cb = new URL(s.callback());
  assert.equal(cb.searchParams.get("error"), "invalid_request");
  assert.match(cb.searchParams.get("error_description"), /PKCE/);
  await s.cleanup();
});

test("a new person signs up with an email code, gets a given name, hides their email, and the platform gets a pairwise ID", async () => {
  const config = await platform(subs.a.clientId, subs.a.clientSecret);
  const s = await startSignIn(config, CALLBACK_A);
  await page.goto(s.url.href);

  await fitsNarrowScreen("id-email");
  await page.fill("#email", PERSON);
  await page.click("text=Send me a code");
  await page.waitForSelector("#code");
  await page.fill("#code", "000000");
  await page.click("text=Continue");
  await page.waitForSelector("text=That code did not match");
  await page.fill("#code", await latestCode(PERSON));
  await page.click("text=Continue");

  await page.waitForSelector("text=Your given name is", { timeout: 5000 }).catch(async (e) => {
    console.log(page.url(), (await page.content()).replace(/<style>[\s\S]*?<\/style>/, "").slice(0, 3000));
    throw e;
  });
  await fitsNarrowScreen("id-permissions");
  const givenName = await page.textContent(".given");
  assert.match(givenName, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.ok(await page.isVisible("text=Add what you learn here to your record"));
  assert.ok(await page.isVisible("text=It will never see"));
  // As in the design, Hide my email is chosen to begin with.
  assert.ok(await page.isChecked("input[value='hide']"));

  await page.click("button:has-text('Allow')");
  await page.waitForTimeout(300);
  assert.ok(s.callback(), "callback was reached");

  const tokens = await oidc.authorizationCodeGrant(config, new URL(s.callback()), { pkceCodeVerifier: s.verifier, expectedState: s.state });
  const claims = tokens.claims();
  assert.match(claims.sub, /^mq_[0-9a-f]{30}$/);
  assert.equal(claims.aud, subs.a.clientId);
  assert.match(claims.email, /^[a-z0-9]{10}@relay\.muslimquotient\.com$/);
  assert.ok(tokens.refresh_token, "refresh token issued");
  assert.ok(tokens.scope.includes("mq.record.learning"));
  subs.subA = claims.sub;

  const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
  assert.equal(info.email, claims.email);

  // Refresh tokens are replaced on every use, and the old one stops working.
  const next = await oidc.refreshTokenGrant(config, tokens.refresh_token);
  assert.ok(next.refresh_token && next.refresh_token !== tokens.refresh_token);

  // A connection lasts until the person disconnects: neither the grant nor the refresh token expires.
  const lasting = await db("select type, expires_at from oidc_payloads where type in ('Grant', 'RefreshToken') and consumed_at is null");
  assert.ok(lasting.some((r) => r.type === "Grant") && lasting.some((r) => r.type === "RefreshToken"));
  for (const r of lasting) assert.equal(r.expires_at, null, `${r.type} has no expiry`);

  // Using an old refresh token again ends the connection.
  await assert.rejects(oidc.refreshTokenGrant(config, tokens.refresh_token));
  await s.cleanup();

  // Email is stored only encrypted.
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  const vault = await c.query("select email_ciphertext from email_vault");
  assert.equal(vault.rowCount, 1);
  assert.ok(!vault.rows[0].email_ciphertext.includes("person@"));
  const people = await c.query("select to_jsonb(p) as row from people p");
  assert.ok(!JSON.stringify(people.rows).includes("@"));
  await c.end();
});

const CALLBACK_C = "http://127.0.0.1:3103/auth/mq/callback";

/** Signs in to a platform with the browser's current Muslim Quotient session. */
async function signInAgain(config, redirect, emailChoice) {
  const s = await startSignIn(config, redirect);
  await page.goto(s.url.href);
  await page.waitForTimeout(300);
  if (!s.callback()) {
    // Already signed in to Muslim Quotient: no code, straight to the permission screen.
    await page.waitForSelector("text=Signed in as");
    assert.equal(await page.isVisible("#email"), false);
    await page.check(`input[value='${emailChoice}']`);
    await page.click("button:has-text('Allow')");
    await page.waitForTimeout(300);
  }
  const tokens = await oidc.authorizationCodeGrant(config, new URL(s.callback()), { pkceCodeVerifier: s.verifier, expectedState: s.state });
  await s.cleanup();
  return tokens.claims();
}

test("another platform gets a different ID, with one tap when already signed in", async () => {
  const b = await registerPlatform({ name: "Quran Circle", website: "https://circle.example", redirect: CALLBACK_B, notice: "https://circle.example/api/mq/notices" });
  await approve(b.clientId);
  const claims = await signInAgain(await platform(b.clientId, b.clientSecret), CALLBACK_B, "share");
  assert.notEqual(claims.sub, subs.subA);
  assert.equal(claims.email, PERSON, "share my email gives the real address");
  subs.b = b;
});

test("platforms in one sector group share a private ID; a used platform's group is locked", async () => {
  await page.goto(`${DEV}/platforms/${subs.a.clientId}`);
  await page.fill("#group", "muslimquotient");
  await page.click("text=Save group");
  await page.waitForSelector("text=can no longer change");

  const c = await registerPlatform({ name: "Our Product One", website: "https://one.example", redirect: CALLBACK_C, notice: "https://one.example/api/mq/notices" });
  const d = await registerPlatform({ name: "Our Product Two", website: "https://two.example", redirect: "http://127.0.0.1:3104/cb", notice: "https://two.example/api/mq/notices" });
  for (const p of [c, d]) {
    await approve(p.clientId);
    await setGroup(p.clientId, "muslimquotient");
  }
  const one = await signInAgain(await platform(c.clientId, c.clientSecret), CALLBACK_C, "hide");
  subs.grouped = one.sub;
  const two = await signInAgain(await platform(d.clientId, d.clientSecret), "http://127.0.0.1:3104/cb", "hide");
  assert.equal(one.sub, two.sub, "same sector group, same private ID");
  assert.notEqual(one.sub, subs.subA);
  assert.notEqual(one.email, two.email, "a relay address per person per platform");
});

// ---- Milestone 2: muslimquotient.com is an ordinary client of the sign-in service ----

async function db(sql, values = []) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    return (await c.query(sql, values)).rows;
  } finally {
    await c.end();
  }
}

test("muslimquotient.com registers in the portal like any platform", async () => {
  // The admin is still signed in to the portal from the tests above.
  const site = await registerPlatform({ name: "Muslim Quotient", website: SITE, redirect: `${SITE}/auth/mq/callback`, notice: "https://muslimquotient.com/api/mq/notices" });
  await approve(site.clientId);
  await setGroup(site.clientId, "muslimquotient");
  subs.site = site;
  await restartServer({ MQ_SITE_CLIENT_ID: site.clientId, MQ_SITE_CLIENT_SECRET: site.clientSecret });
});

test("a newcomer creates their ID from the home page and lands on their dashboard", async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const fresh = await context.newPage();
  await fresh.goto(SITE);
  assert.equal(await fresh.evaluate(() => document.documentElement.scrollWidth <= 360), true, "home page fits 360px");
  await fresh.click("text=Create your MQ ID");
  await fresh.waitForSelector("#email");
  assert.ok(fresh.url().startsWith(`${ID}/interaction/`), "sign-up happens on the sign-in service");
  await fresh.fill("#email", "newcomer@example.com");
  await fresh.click("text=Send me a code");
  await fresh.waitForSelector("#code");
  await fresh.fill("#code", await latestCode("newcomer@example.com"));
  await fresh.click("text=Continue");
  await fresh.waitForSelector("text=Your given name is");
  const givenName = await fresh.textContent(".given");
  await fresh.click("button:has-text('Allow')");
  await fresh.waitForURL(`${SITE}/dashboard`);
  await fresh.waitForSelector(".d-name");
  assert.ok((await fresh.textContent(".d-name")).includes(givenName));
  assert.ok(await fresh.isVisible("text=Nothing here yet"), "Reflection is empty until Mohasaba connects");
  assert.equal(await fresh.isVisible("text=Muslim Quotient questions"), false);
  const width = await fresh.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 360, `dashboard is ${width}px wide at 360px`);
  await fresh.screenshot({ path: path.join(ROOT, ".mq-test", "dashboard-new.png"), fullPage: true });

  // Sign out, then back in: Muslim Quotient remembers the person and the permission, so no code and no screen.
  await fresh.click("text=Sign out");
  await fresh.waitForURL(`${SITE}/`);
  await fresh.goto(`${SITE}/dashboard`);
  await fresh.waitForURL(`${SITE}/dashboard`);
  await fresh.waitForSelector(".d-name");
  await context.close();
});

test("the dashboard shows only the person's own record, and the website shares our sector group's ID", async () => {
  // Someone already connected to four platforms signs in on muslimquotient.com.
  await page.goto(`${SITE}/signin`);
  await page.waitForSelector("text=Signed in as");
  await page.click("button:has-text('Allow')");
  await page.waitForURL(`${SITE}/dashboard`);

  const [me] = await db(
    "select c.person_id, c.sub from connections c where c.client_id = $1 and exists (select 1 from connections x where x.person_id = c.person_id and x.client_id = $2)",
    [subs.site.clientId, subs.a.clientId],
  );
  const [other] = await db("select person_id from connections where client_id = $1 and person_id <> $2", [subs.site.clientId, me.person_id]);
  assert.equal(me.sub, subs.grouped, "muslimquotient.com and our products share one private ID");

  // Entries as the record service (M3) will write them, for both people.
  const add = (person, title, low, high, key) => db(
    `insert into entries (person_id, client_id, type, action, title, range_low, range_high, range_of, occurred_at, tz, vocabulary_version, key, source)
     values ($1, $2, 'reflection', 'test.result', $3, $4, $5, 10, now(), 'Asia/Kolkata', 1, $6, 'server')`,
    [person, subs.a.clientId, title, low, high, key],
  );
  await add(me.person_id, "Worship", 4, 5, "mine-1");
  await add(other.person_id, "Character", 2, 3, "theirs-1");
  await db(
    `insert into entries (person_id, client_id, type, action, title, occurred_at, tz, vocabulary_version, key, source)
     values ($1, $2, 'practice', 'act.kept', 'Daily istighfar kept', now(), 'Asia/Kolkata', 1, 'p-1', 'server')`,
    [me.person_id, subs.b.clientId],
  );

  await page.reload();
  await page.waitForSelector(".d-range");
  assert.equal((await page.textContent(".d-range")).replace(/\s+/g, " ").trim(), "4–5of 10");
  assert.ok(await page.isVisible("text=1 day kept"));
  assert.equal(await page.isVisible("text=Character"), false, "another person's results never show");
  for (const name of ["Halaqa Notes", "Quran Circle", "Our Product One", "Our Product Two"]) assert.ok(await page.isVisible(`text=${name}`), name);
  assert.equal(await page.isVisible(".d-plat >> text=Muslim Quotient"), false, "the website itself is not listed as a platform");
  await fitsNarrowScreen("dashboard");
});

// Milestone 3: the record service ------------------------------------------------------------

const CALLBACK_E = "http://127.0.0.1:3105/auth/mq/callback";
const PRACTICE_SCOPE = "openid mq.record.practice mq.record.import mq.settings.prayer";

/** A platform calling the record service from its server. */
function send(path, token, body, method = "POST") {
  return localFetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");
const kept = (key, at = day(0)) => ({ vocabulary_version: 1, type: "practice", action: "act.kept", title: "Daily istighfar kept", occurred_at: at, tz: "Asia/Kolkata", key });

test("a platform adds entries with the person's token, only for the parts the person allowed", async () => {
  const e = await registerPlatform({
    name: "Istighfar Test", website: "https://istighfar.example", redirect: CALLBACK_E, notice: "https://istighfar.example/api/mq/notices",
    scopes: ["mq.record.practice", "mq.record.import", "mq.settings.prayer"],
  });
  await approve(e.clientId);
  await setGroup(e.clientId, "muslimquotient");
  subs.e = e;

  // The person from the tests above, still signed in to Muslim Quotient in this browser.
  const config = await platform(e.clientId, e.clientSecret);
  const s = await startSignIn(config, CALLBACK_E, { scope: PRACTICE_SCOPE });
  await page.goto(s.url.href);
  await page.waitForSelector("text=Signed in as");
  assert.ok(await page.isVisible("text=Add what you practise here to your record"));
  await page.click("button:has-text('Allow')");
  await page.waitForTimeout(300);
  const tokens = await oidc.authorizationCodeGrant(config, new URL(s.callback()), { pkceCodeVerifier: s.verifier, expectedState: s.state });
  await s.cleanup();
  assert.equal(tokens.claims().sub, subs.grouped, "same private ID as our other products");
  subs.token = tokens.access_token;

  assert.equal((await send("/v1/record", null, kept("x"))).status, 401);
  assert.equal((await send("/v1/record", "not-a-token", kept("x"))).status, 401);

  const first = await send("/v1/record", subs.token, kept("day-0"));
  assert.equal(first.status, 201);
  const { id } = await first.json();
  const again = await send("/v1/record", subs.token, kept("day-0"));
  assert.equal(again.status, 200, "resending a key returns the first entry");
  assert.equal((await again.json()).id, id);

  const learning = await send("/v1/record", subs.token, { ...kept("l-1"), type: "learning", action: "lesson.completed" });
  assert.equal(learning.status, 403, "Learning was not allowed");
  assert.equal((await learning.json()).error, "insufficient_scope");

  const unknown = await send("/v1/record", subs.token, { ...kept("u-1"), action: "act.counted" });
  assert.equal(unknown.status, 400);
  assert.match((await unknown.json()).error_description, /Unknown action/);
  const counted = await send("/v1/record", subs.token, { ...kept("c-1"), amount: 100 });
  assert.equal(counted.status, 400, "no counts for practice yet");
  const noRange = await send("/v1/record", subs.token, { ...kept("r-1"), type: "reflection", action: "test.result", title: "Worship" });
  assert.equal(noRange.status, 400, "a reflection without a range is refused");

  const settings = await send("/v1/settings", subs.token, null, "GET");
  assert.equal(settings.status, 200);
  const body = await settings.json();
  assert.equal(body.prayer, null, "not set yet");
  assert.equal("language" in body, false, "language was not allowed");

  const rows = await db("select person_id, type, action, source, tz from entries where id = $1", [id]);
  assert.deepEqual({ ...rows[0], person_id: undefined }, { person_id: undefined, type: "practice", action: "act.kept", source: "server", tz: "Asia/Kolkata" });
});

test("past activity waits for the person's approval on the dashboard, and is allowed once", async () => {
  const history = [kept("day-3", day(3)), kept("day-2", day(2)), kept("day-2", day(2))];
  const r = await send("/v1/record/import", subs.token, { vocabulary_version: 1, entries: history.map(({ vocabulary_version, ...e }) => e) });
  assert.equal(r.status, 202);
  const imp = await r.json();
  assert.equal(imp.status, "pending");
  assert.equal(imp.entries, 2, "a repeated key counts once");
  assert.equal((await send("/v1/record/import", subs.token, { vocabulary_version: 1, entries: [kept("day-9", day(9))] })).status, 409);
  assert.equal((await db("select count(*)::int as n from entries where import_id = $1", [imp.id]))[0].n, 0, "nothing added before approval");

  await page.goto(`${SITE}/dashboard`);
  await page.waitForSelector("text=Istighfar Test wants to add 2 past entries to your record.");
  await fitsNarrowScreen("dashboard-import");
  await page.click("button:has-text('Add them')");
  await page.waitForSelector("text=Istighfar Test wants to add", { state: "detached" });
  assert.equal((await db("select count(*)::int as n from entries where import_id = $1", [imp.id]))[0].n, 2);
  assert.ok(await page.isVisible("text=3 entries added"));
});

test("entries are limited to 60 a minute per person, and stop when the person disconnects", async () => {
  // One entry was added live in the test above, within this minute.
  const sent = await Promise.all(Array.from({ length: 60 }, (_, i) => send("/v1/record", subs.token, kept(`burst-${i}`))));
  const statuses = sent.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 59);
  const limited = sent.find((r) => r.status === 429);
  assert.equal(limited.headers.get("retry-after"), "60");

  await db("update connections set revoked_at = now() where client_id = $1", [subs.e.clientId]);
  assert.equal((await send("/v1/record", subs.token, kept("after"))).status, 401);
});

test("the record service answers only on its own host", async () => {
  assert.equal((await localFetch(`${SITE}/api/v1/record`, { method: "POST" })).status, 404);
  assert.equal((await localFetch(`${API}/dashboard`)).status, 404);
});

// Notices -------------------------------------------------------------------------------------

/** A platform's notice address: keeps what arrives, and answers with `noticeAnswer`. */
const received = [];
let noticeAnswer = 200;
function startNoticeServer(port) {
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({ method: req.method, headers: req.headers, raw });
      res.statusCode = noticeAnswer;
      res.end();
    });
  });
  callbackServers.push(srv);
  return new Promise((resolve) => srv.listen(port, resolve));
}

/** Exactly the check the developer guide gives platforms. */
function guideVerify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

test("a platform checks a signed test notice from the portal, as the guide says", async () => {
  await startNoticeServer(3106);
  const n = await registerPlatform({ name: "Notice Test", website: "https://notice.example", redirect: "http://127.0.0.1:3107/cb", notice: "http://127.0.0.1:3106/api/mq/notices" });
  assert.match(n.signingSecret, /^mqn_/);

  await page.goto(`${DEV}/platforms/${n.clientId}`);
  await page.click("text=Send a test notice");
  await page.waitForSelector("text=Delivered. Your address answered 200.");
  const got = received.at(-1);
  assert.equal(got.method, "POST");
  assert.equal(got.headers["content-type"], "application/json");
  assert.ok(guideVerify(got.raw, got.headers["mq-signature"], n.signingSecret), "signature checks out");
  assert.equal(guideVerify(got.raw, got.headers["mq-signature"], "mqn_wrong"), false);
  const body = JSON.parse(got.raw);
  assert.equal(body.event, "notice.test");
  assert.equal(body.id, got.headers["mq-notice-id"]);
  assert.match(body.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

  noticeAnswer = 500;
  await page.click("text=Send a test notice");
  await page.waitForSelector("text=Not delivered. Your address answered 500; it must answer 2xx.");
  noticeAnswer = 200;
  await page.reload();
  assert.equal(await page.locator("[data-testid=notice-row]").count(), 2);
  assert.ok(await page.isVisible("text=Delivered (200)"));
  await fitsNarrowScreen("portal-notices");
});

// The full dashboard (M5) ---------------------------------------------------------------------

const CALLBACK_F = "http://127.0.0.1:3107/cb";
const DASH_SCOPE = "openid email mq.record.learning mq.settings.prayer";

/** Signs the browser's person in to a platform with the given scope, allowing whatever is asked. */
async function connectWith(p, config, redirect, scope, choice = "hide") {
  const s = await startSignIn(config, redirect, { scope });
  await p.goto(s.url.href);
  await p.waitForTimeout(300);
  if (!s.callback()) {
    await p.waitForSelector("button:has-text('Allow')");
    if (await p.$(`input[value='${choice}']`)) await p.check(`input[value='${choice}']`);
    await p.click("button:has-text('Allow')");
    await p.waitForTimeout(300);
  }
  const tokens = await oidc.authorizationCodeGrant(config, new URL(s.callback()), { pkceCodeVerifier: s.verifier, expectedState: s.state });
  await s.cleanup();
  return tokens;
}

const lastNotice = (event) => [...received].reverse().find((n) => JSON.parse(n.raw).event === event);
const learned = (key) => ({ vocabulary_version: 1, type: "learning", action: "lesson.completed", title: "Tajwid, lesson 8", progress: { done: 8, of: 20 }, occurred_at: day(0), tz: "Asia/Kolkata", key });

test("the dashboard: platforms, what each may do, email, prayer settings, goals, picture, export", async () => {
  const d = await registerPlatform({
    name: "Dashboard Test", website: "https://dash.example", redirect: CALLBACK_F, notice: "http://127.0.0.1:3106/api/mq/notices",
    scopes: ["email", "mq.record.learning", "mq.settings.prayer"],
  });
  await approve(d.clientId);
  subs.d = d;
  const config = await platform(d.clientId, d.clientSecret);
  const tokens = await connectWith(page, config, CALLBACK_F, DASH_SCOPE, "hide");
  subs.dTokens = tokens;
  assert.match(tokens.claims().email, /@relay\.muslimquotient\.com$/);
  assert.equal((await send("/v1/record", tokens.access_token, learned("dash-1"))).status, 201);

  for (const path of ["/dashboard", "/dashboard/platforms", "/dashboard/picture", "/dashboard/goals", "/dashboard/connect", "/dashboard/prayer", "/dashboard/privacy"]) {
    await page.goto(`${SITE}${path}`);
    await page.waitForSelector(".d-title, .d-card");
    await fitsNarrowScreen(`dash${path.replace(/\//g, "-")}`);
  }

  // My platforms, then the platform's own page.
  await page.goto(`${SITE}/dashboard/platforms`);
  await page.click(".d-pcard:has-text('Dashboard Test')");
  await page.waitForSelector("text=Tajwid, lesson 8");
  assert.ok(await page.isVisible(`text=${tokens.claims().sub}`), "shows its private ID");
  await fitsNarrowScreen("dash-platform");

  // Email: switch to the real one; the platform reads it next time.
  await page.click("button:has-text('My real email')");
  await page.waitForSelector("button.on:has-text('My real email')");
  const info = await oidc.fetchUserInfo(config, tokens.access_token, tokens.claims().sub);
  assert.equal(info.email, PERSON);

  // Prayer settings: saved once, read by the platform, which is told.
  const before = received.length;
  await page.goto(`${SITE}/dashboard/prayer`);
  await page.fill("#p-city", "Hyderabad");
  await page.fill("#p-lat", "17.38512");
  await page.fill("#p-lng", "78.48671");
  await page.selectOption("#p-method", "Karachi");
  await page.selectOption("#p-asr", "hanafi");
  await page.selectOption("#p-tz", "Europe/London");
  await page.click("button:has-text('Save')");
  await page.waitForSelector("text=Saved. Your platforms have been told.");
  const settings = await (await send("/v1/settings", tokens.access_token, null, "GET")).json();
  assert.deepEqual(settings.prayer, { location: { city: "Hyderabad", lat: 17.39, lng: 78.49 }, method: "Karachi", asr: "hanafi", hijri_adjust: 0 });
  assert.equal(settings.tz, "Europe/London");
  assert.ok(received.length > before);
  const told = lastNotice("settings.updated");
  assert.equal(JSON.parse(told.raw).sub, tokens.claims().sub);
  assert.ok(guideVerify(told.raw, told.headers["mq-signature"], d.signingSecret));

  // Take back a permission: the record service refuses at once.
  await page.goto(`${SITE}/dashboard/platforms/${d.clientId}`);
  await page.click(".d-row-line:has-text('Add what you learn here') button:has-text('Take back')");
  await page.waitForSelector("text=Add what you learn here", { state: "detached" });
  assert.equal((await send("/v1/record", tokens.access_token, learned("dash-2"))).status, 403);

  // Goals open the platform where the work happens.
  await page.goto(`${SITE}/dashboard/goals`);
  await page.fill("#g-title", "Memorise Sūrat al-Mulk");
  await page.selectOption("#g-where", d.clientId);
  await page.click("button:has-text('Set this goal')");
  await page.waitForSelector("text=Continue in Dashboard Test");
  assert.equal(await page.getAttribute("a:has-text('Continue in Dashboard Test')", "href"), "https://dash.example");
  await page.click("button:has-text('Done')");
  await page.waitForSelector("text=Bring back");
  await fitsNarrowScreen("dash-goals-set");

  // Export: everything, as one file.
  const exp = await page.evaluate(async () => (await fetch("/dashboard/export")).json());
  assert.equal(exp.email, PERSON);
  assert.ok(exp.entries.some((e) => e.title === "Tajwid, lesson 8"));
  assert.ok(exp.goals.some((g) => g.title === "Memorise Sūrat al-Mulk"));

  // My picture shows the learning, and ranges stay hidden until held.
  await page.goto(`${SITE}/dashboard/picture`);
  await page.waitForSelector("text=Tajwid, lesson 8");
  assert.ok(await page.isVisible(".d-held"));
});

test("disconnecting tells the platform and can remove what it added", async () => {
  const sub = subs.dTokens.claims().sub;
  await page.goto(`${SITE}/dashboard/platforms/${subs.d.clientId}`);
  await page.click("button:has-text('Disconnect and remove what it added')");
  await page.waitForSelector("text=Disconnected. The platform has been told");
  const n = lastNotice("connection.revoked");
  assert.equal(JSON.parse(n.raw).sub, sub);
  assert.ok(guideVerify(n.raw, n.headers["mq-signature"], subs.d.signingSecret));
  assert.equal((await db("select count(*)::int as n from entries where client_id = $1", [subs.d.clientId]))[0].n, 0);
  assert.equal((await send("/v1/settings", subs.dTokens.access_token, null, "GET")).status, 401);
  await assert.rejects(oidc.refreshTokenGrant(await platform(subs.d.clientId, subs.d.clientSecret), subs.dTokens.refresh_token));
  assert.equal(await page.isVisible(".d-pcard:has-text('Dashboard Test')"), false);
});

test("deleting the account removes everything and tells every platform", async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const p = await context.newPage();
  // A new person: signs up on Dashboard Test, then on muslimquotient.com.
  const config = await platform(subs.d.clientId, subs.d.clientSecret);
  const s = await startSignIn(config, CALLBACK_F, { scope: DASH_SCOPE });
  await p.goto(s.url.href);
  await p.fill("#email", "leaver@example.com");
  await p.click("text=Send me a code");
  await p.waitForSelector("#code");
  await p.fill("#code", await latestCode("leaver@example.com"));
  await p.click("text=Continue");
  await p.click("button:has-text('Allow')");
  await p.waitForTimeout(300);
  const tokens = await oidc.authorizationCodeGrant(config, new URL(s.callback()), { pkceCodeVerifier: s.verifier, expectedState: s.state });
  await s.cleanup();
  await p.goto(`${SITE}/signin`);
  await p.click("button:has-text('Allow')");
  await p.waitForURL(`${SITE}/dashboard`);
  const [{ id }] = await db("select person_id as id from connections where sub = $1", [tokens.claims().sub]);

  await p.goto(`${SITE}/dashboard/privacy`);
  const name = (await p.textContent(".d-namecard h2")).trim();
  await p.fill("#d-confirm", "not my name");
  await p.click("button:has-text('Delete everything')");
  await p.waitForSelector("text=Type your given name exactly");
  await p.fill("#d-confirm", name);
  await p.click("button:has-text('Delete everything')");
  await p.waitForURL(`${SITE}/?deleted=1`);

  for (const table of ["people", "email_vault", "connections", "entries", "given_names", "settings", "goals"]) {
    const col = table === "people" ? "id" : "person_id";
    assert.equal((await db(`select count(*)::int as n from ${table} where ${col} = $1`, [id]))[0].n, 0, table);
  }
  const n = lastNotice("account.deleted");
  assert.equal(JSON.parse(n.raw).sub, tokens.claims().sub);
  assert.ok(guideVerify(n.raw, n.headers["mq-signature"], subs.d.signingSecret));
  await assert.rejects(oidc.refreshTokenGrant(config, tokens.refresh_token));
  await p.goto(`${SITE}/dashboard`);
  await p.waitForURL(/\/authorize|\/interaction\//);
  await context.close();
});

test("the daily job is protected and runs", async () => {
  const no = await localFetch(`http://localhost:${PORT}/api/cron/daily`);
  assert.equal(no.status, 401);
  const yes = await localFetch(`http://localhost:${PORT}/api/cron/daily`, { headers: { authorization: "Bearer test-cron" } });
  assert.equal(yes.status, 200);
  assert.deepEqual(Object.keys(await yes.json()).sort(), ["notices", "renamed", "swept"]);
});

test("the website does not answer for the sign-in service or the portal", async () => {
  for (const p of ["/api/id/authorize", "/developers"]) {
    const r = await localFetch(`http://localhost:${PORT}${p}`);
    assert.equal(r.status, 404, p);
  }
});
