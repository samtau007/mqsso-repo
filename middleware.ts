import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/questions", "/result"];
const SRC_PARAMS = ["ref", "utm_source", "utm_medium", "utm_campaign"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    return NextResponse.redirect(url);
  }

  // First-touch attribution. TODO (see CLAUDE.md step 4): save into mq_entries.source.
  if (!request.cookies.get("mq_src")) {
    const src: Record<string, string> = {};
    SRC_PARAMS.forEach((k) => {
      const v = request.nextUrl.searchParams.get(k);
      if (v) src[k] = v;
    });
    if (Object.keys(src).length) {
      response.cookies.set("mq_src", JSON.stringify(src), { maxAge: 60 * 60 * 24 * 90, path: "/" });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
