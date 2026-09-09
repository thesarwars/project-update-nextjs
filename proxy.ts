import { NextResponse, type NextRequest } from "next/server";

/**
 * An optimistic check only — it never touches the database.
 *
 * All it does is notice that no session cookie was sent at all, so a signed-out visitor
 * lands on the login page instead of watching the app shell flash before a redirect.
 * A cookie being *present* proves nothing here; every page and every route handler
 * validates it properly through lib/auth.ts. Next's own docs are explicit that proxy
 * "should not be used as a full session management or authorization solution".
 */
const SESSION_COOKIE = "session";

const PUBLIC_PATHS = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  // An API call gets a status it can act on; a page gets sent somewhere useful.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the icon, which must stay reachable so the
  // login page can style itself.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
