import { ApiError, authenticate, type Caller } from "./record";

// Shared handling for api.muslimquotient.com: bearer token, JSON in and out, clear errors.
// No cookies and no CORS: platforms call the record service from their servers.

const MAX_BODY = 4 * 1024 * 1024;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "invalid_request", "Send Content-Type: application/json.");
  }
  const text = await req.text();
  if (text.length > MAX_BODY) throw new ApiError(413, "too_large", "The request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_request", "The body is not valid JSON.");
  }
}

export function api(handler: (caller: Caller, body: unknown) => Promise<{ status: number; body: unknown }>, { body = true } = {}) {
  return async (req: Request) => {
    try {
      const caller = await authenticate(req.headers.get("authorization"));
      const out = await handler(caller, body ? await readJson(req) : undefined);
      return json(out.status, out.body);
    } catch (e) {
      if (e instanceof ApiError) {
        const headers: Record<string, string> = {};
        if (e.status === 401) headers["www-authenticate"] = `Bearer error="${e.error}"`;
        if (e.status === 429) headers["retry-after"] = "60";
        return json(e.status, { error: e.error, error_description: e.message, ...e.extra }, headers);
      }
      console.error(e);
      return json(500, { error: "server_error", error_description: "Something went wrong on our side. Send the entry again with the same key." });
    }
  };
}
