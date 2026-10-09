import { api } from "@/lib/api";
import { requestImport } from "@/lib/record";

export const dynamic = "force-dynamic";

// POST https://api.muslimquotient.com/v1/record/import
export const POST = api(async (caller, body) => ({ status: 202, body: await requestImport(caller, body) }));
