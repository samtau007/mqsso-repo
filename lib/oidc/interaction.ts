import type { IncomingMessage, ServerResponse } from "node:http";
import { codeErrorMessage, issueCode, pendingEmail, verifyCode } from "../codes";
import { getConnection, hasConnections, pairwiseSub, saveConnection, type EmailChoice } from "../connections";
import { findOrCreatePerson, getPerson } from "../people";
import { knownScopes, scopeInfo } from "../scopes";
import { codeStep, consentStep, emailStep, errorPage } from "./pages";
import { provider, sectorGroupOf } from "./provider";

function send(res: ServerResponse, status: number, html: string) {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self' *; frame-ancestors 'none'; base-uri 'none'");
  res.end(html);
}

function redirect(res: ServerResponse, location: string) {
  res.statusCode = 303;
  res.setHeader("location", location);
  res.setHeader("cache-control", "no-store");
  res.end();
}

/** Reads a small urlencoded form. Uses events, not async iteration, which would destroy the request the provider still needs. */
function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16 * 1024) {
        req.removeAllListeners("data");
        reject(new Error("Form too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

type Details = Awaited<ReturnType<ReturnType<typeof provider>["interactionDetails"]>>;

/** The scopes this client asked for that it is also registered for, in catalogue order. */
async function requestedScopes(details: Details, client: { metadata(): Record<string, unknown> }) {
  const allowed = new Set(String(client.metadata().scope ?? "").split(" "));
  return knownScopes(String(details.params.scope ?? "")).filter((s) => allowed.has(s));
}

async function renderConsent(res: ServerResponse, details: Details, error?: string, status = 200) {
  const p = provider();
  const client = await p.Client.find(String(details.params.client_id));
  if (!client) return send(res, 400, errorPage("This sign-in could not continue", "<p>This platform is not able to sign people in with Muslim Quotient yet.</p>"));
  const accountId = details.session!.accountId;
  const person = await getPerson(accountId);
  if (!person) return send(res, 400, errorPage("This sign-in could not continue", "<p>Please go back and start again.</p>"));
  const scopes = await requestedScopes(details, client);
  const conn = await getConnection(accountId, client.clientId);
  return send(res, status, consentStep({
    uid: details.uid,
    clientName: client.clientName ?? client.clientId,
    givenName: person.givenName,
    isNew: !(await hasConnections(accountId)),
    scopes: scopes.map((s) => scopeInfo(s)!).filter(Boolean),
    emailRequested: scopes.includes("email"),
    emailChoice: conn?.emailChoice ?? null,
    relayAddress: conn?.relayAddress ?? null,
    error,
  }));
}

/**
 * Handles /interaction/:uid (GET) and /interaction/:uid/:action (POST) on the id host.
 * The interaction cookie set by the provider ties every step to this browser.
 */
export async function handleInteraction(req: IncomingMessage, res: ServerResponse, uid: string, action: string | undefined) {
  const p = provider();
  let details: Details;
  try {
    details = await p.interactionDetails(req, res);
  } catch {
    return send(res, 400, errorPage("This sign-in has expired", "<p>Go back to the platform you came from and start again.</p>"));
  }
  if (details.uid !== uid) return send(res, 400, errorPage("This sign-in has expired", "<p>Go back to the platform you came from and start again.</p>"));

  const client = await p.Client.find(String(details.params.client_id));
  const clientName = client?.clientName ?? "the platform";
  const prompt = details.prompt.name;
  const url = new URL(req.url ?? "/", "http://x");

  if (req.method === "GET" && !action) {
    if (prompt === "login") {
      const email = await pendingEmail("signin", uid);
      if (email && url.searchParams.get("step") !== "email") return send(res, 200, codeStep({ uid, email, clientName }));
      return send(res, 200, emailStep({ uid, clientName }));
    }
    if (prompt === "consent") return renderConsent(res, details);
    return send(res, 400, errorPage("This sign-in could not continue", "<p>Go back to the platform you came from and start again.</p>"));
  }

  if (req.method !== "POST") return send(res, 405, errorPage("Not allowed", ""));
  const form = await readForm(req);

  switch (action) {
    case "abort":
      return p.interactionFinished(req, res, { error: "access_denied", error_description: "The person cancelled" }, { mergeWithLastSubmission: false });

    case "email": {
      if (prompt !== "login") return redirect(res, `/interaction/${uid}`);
      const email = String(form.get("email") ?? "");
      try {
        await issueCode("signin", uid, email);
      } catch (e) {
        return send(res, 400, emailStep({ uid, clientName, email, error: codeErrorMessage(e) }));
      }
      return redirect(res, `/interaction/${uid}`);
    }

    case "resend": {
      if (prompt !== "login") return redirect(res, `/interaction/${uid}`);
      const email = await pendingEmail("signin", uid);
      if (!email) return redirect(res, `/interaction/${uid}?step=email`);
      try {
        await issueCode("signin", uid, email);
      } catch (e) {
        return send(res, 400, codeStep({ uid, email, clientName, error: codeErrorMessage(e) }));
      }
      return send(res, 200, codeStep({ uid, email, clientName, sent: true }));
    }

    case "code": {
      if (prompt !== "login") return redirect(res, `/interaction/${uid}`);
      const code = String(form.get("code") ?? "").replace(/\D/g, "");
      let email: string;
      try {
        email = await verifyCode("signin", uid, code);
      } catch (e) {
        const pending = (await pendingEmail("signin", uid)) ?? "";
        return send(res, 400, codeStep({ uid, email: pending, clientName, error: codeErrorMessage(e) }));
      }
      const { person } = await findOrCreatePerson(email);
      return p.interactionFinished(req, res, { login: { accountId: person.id } }, { mergeWithLastSubmission: false });
    }

    case "confirm": {
      if (prompt !== "consent" || !client) return redirect(res, `/interaction/${uid}`);
      const accountId = details.session!.accountId;
      const requested = await requestedScopes(details, client);
      const ticked = new Set(form.getAll("scope"));
      const allowed = requested.filter((s) => s === "openid" || ticked.has(s));
      const refused = requested.filter((s) => !allowed.includes(s));

      let emailChoice: EmailChoice | null = null;
      if (allowed.includes("email")) {
        const c = form.get("email_choice");
        if (c !== "share" && c !== "hide") return renderConsent(res, details, "Choose which email this platform should get.", 400);
        emailChoice = c;
      }

      const grant = new p.Grant({ accountId, clientId: client.clientId });
      grant.addOIDCScope(allowed.join(" "));
      if (refused.length) grant.rejectOIDCScope(refused.join(" "));
      const claims = details.prompt.details.missingOIDCClaims as string[] | undefined;
      if (claims?.length) grant.addOIDCClaims(claims);
      const grantId = await grant.save();

      await saveConnection({
        personId: accountId,
        clientId: client.clientId,
        sub: pairwiseSub(sectorGroupOf(client), accountId),
        scopes: allowed,
        emailChoice,
      });
      return p.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
    }

    default:
      return send(res, 404, errorPage("Not found", ""));
  }
}
