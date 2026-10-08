import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Is the database reachable? For the status page and deploy checks. Says nothing about anyone.
export async function GET() {
  try {
    await query("select 1 from schema_migrations limit 1");
    return Response.json({ db: "ok" });
  } catch (e) {
    // Detail only outside production, to diagnose a new environment.
    const detail = process.env.VERCEL_ENV === "production" ? undefined : (e as Error).message;
    return Response.json({ db: "error", detail }, { status: 503 });
  }
}
