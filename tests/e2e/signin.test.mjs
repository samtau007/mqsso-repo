// Milestone 1, done when: a test platform registers in the portal, follows the developer guide,
// and signs a person in. Milestone 2, done when: sign up on muslimquotient.com works end to end. Runs the built app (npm run build first) against a real Postgres.
//
//   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1/mq_test npm run test:e2e
//
// The database named in TEST_DATABASE_URL is wiped. Never point it at a real database.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
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
      MQ_ID_ORIGIN: ID, MQ_DEVELOPERS_ORIGIN: DEV, MQ_SITE_ORIGIN: SITE,
      MQ_MAIL_OUTBOX: OUTBOX, MQ_PORTAL_ADMINS: ADMIN, RESEND_API_KEY: "",
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
  for (const port of [3101, 3102, 3103, 3104]) await startCallbackServer(port);
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

async function registerPlatform({ name, website, redirect, notice }) {
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
  await page.check("input[value='email']");
  await page.check("input[value='mq.record.learning']");
  await page.click("text=Register platform");
  await page.waitForSelector("[data-testid=client-secret]");
  return {
    clientId: await page.textContent("[data-testid=client-id]"),
    clientSecret: await page.textContent("[data-testid=client-secret]"),
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
async function startSignIn(config, redirectUri, { pkce = true } = {}) {
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const params = { redirect_uri: redirectUri, scope: "openid email mq.record.learning", state };
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
  await fresh.click("text=Create your ID");
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

test("the daily job is protected and runs", async () => {
  const no = await localFetch(`http://localhost:${PORT}/api/cron/daily`);
  assert.equal(no.status, 401);
  const yes = await localFetch(`http://localhost:${PORT}/api/cron/daily`, { headers: { authorization: "Bearer test-cron" } });
  assert.equal(yes.status, 200);
  assert.deepEqual(Object.keys(await yes.json()).sort(), ["renamed", "swept"]);
});

test("the website does not answer for the sign-in service or the portal", async () => {
  for (const p of ["/api/id/authorize", "/developers"]) {
    const r = await localFetch(`http://localhost:${PORT}${p}`);
    assert.equal(r.status, 404, p);
  }
});
