import { exportRecord } from "@/lib/account";
import { currentPersonId } from "@/lib/site/session";

export const dynamic = "force-dynamic";

/** Export my record: everything held about the person, as one JSON file. */
export async function GET() {
  const personId = await currentPersonId();
  if (!personId) return new Response("Sign in first", { status: 401 });
  const record = await exportRecord(personId);
  return new Response(JSON.stringify(record, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="muslim-quotient-record-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
