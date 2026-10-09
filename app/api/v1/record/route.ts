import { api } from "@/lib/api";
import { record } from "@/lib/record";

export const dynamic = "force-dynamic";

// POST https://api.muslimquotient.com/v1/record
export const POST = api(async (caller, body) => {
  const r = await record(caller, body);
  return { status: r.created ? 201 : 200, body: { id: r.id } };
});
