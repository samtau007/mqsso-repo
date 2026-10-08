import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { endSession } from "@/lib/site/session";

export const dynamic = "force-dynamic";

/** Signs out of muslimquotient.com. The Muslim Quotient sign-in on this device stays, as for any platform. */
export async function POST() {
  endSession();
  return NextResponse.redirect(`${env.siteOrigin}/`, 303);
}
