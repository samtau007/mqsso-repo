import { NextResponse, type NextRequest } from "next/server";

// One deployment serves several hosts:
//   id.muslimquotient.com          sign-in service   -> pages/api/id
//   developers.muslimquotient.com  developer portal  -> app/developers
//   muslimquotient.com             website and dashboard
// No cookies are set here; no visitor tracking.

function hostOf(origin: string | undefined, fallback: string) {
  try {
    return new URL(origin || fallback).host;
  } catch {
    return fallback;
  }
}

const ID_HOST = hostOf(process.env.MQ_ID_ORIGIN, "https://id.muslimquotient.com");
const DEV_HOST = hostOf(process.env.MQ_DEVELOPERS_ORIGIN, "https://developers.muslimquotient.com");

const notFound = () => new NextResponse("Not found", { status: 404 });

export function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const url = request.nextUrl.clone();
  const path = url.pathname;

  if (path.startsWith("/fonts/")) return NextResponse.next();

  if (host === ID_HOST) {
    url.pathname = path === "/" ? "/api/id" : `/api/id${path}`;
    return NextResponse.rewrite(url);
  }

  if (host === DEV_HOST) {
    if (path.startsWith("/api/") || path.startsWith("/developers")) return notFound();
    url.pathname = path === "/" ? "/developers" : `/developers${path}`;
    return NextResponse.rewrite(url);
  }

  // The website must not answer for the other hosts' routes.
  if (path.startsWith("/api/id") || path.startsWith("/developers")) return notFound();
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
