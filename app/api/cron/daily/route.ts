import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { retryDueNotices } from "@/lib/notices";
import { sweepExpired } from "@/lib/oidc/adapter";
import { rotateDueNames } from "@/lib/people";

export const dynamic = "force-dynamic";

// Daily job (vercel.json): gives new given names to everyone whose 30 days are up, and clears
// expired sign-in records, and retries notices to platforms that have not answered yet. Vercel sends "Authorization: Bearer CRON_SECRET".
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) return new Response("Unauthorised", { status: 401 });
  const renamed = await rotateDueNames();
  const swept = await sweepExpired();
  const notices = await retryDueNotices();
  return Response.json({ renamed, swept, notices });
}
