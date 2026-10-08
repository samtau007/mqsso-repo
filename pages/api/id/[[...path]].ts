import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "@/lib/env";
import { handleInteraction } from "@/lib/oidc/interaction";
import { provider } from "@/lib/oidc/provider";

// Everything on id.muslimquotient.com arrives here (see middleware.ts). The provider needs the
// raw request, so Next's body parser is off.
export const config = { api: { bodyParser: false, externalResolver: true } };

export default async function idService(req: NextApiRequest, res: NextApiResponse) {
  req.url = (req.url ?? "/").replace(/^\/api\/id/, "") || "/";
  if (req.url.startsWith("?")) req.url = `/${req.url}`;

  const m = /^\/interaction\/([A-Za-z0-9_-]+)(?:\/([a-z]+))?\/?(?:\?.*)?$/.exec(req.url);
  if (m) return handleInteraction(req, res, m[1], m[2]);

  if (req.url === "/" || req.url.startsWith("/?")) {
    res.statusCode = 302;
    res.setHeader("location", env.siteOrigin);
    return res.end();
  }

  return provider().callback()(req, res);
}
