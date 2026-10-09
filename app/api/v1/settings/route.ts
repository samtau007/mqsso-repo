import { api } from "@/lib/api";
import { readSettings } from "@/lib/record";

export const dynamic = "force-dynamic";

// GET https://api.muslimquotient.com/v1/settings
export const GET = api(async (caller) => ({ status: 200, body: await readSettings(caller) }), { body: false });
