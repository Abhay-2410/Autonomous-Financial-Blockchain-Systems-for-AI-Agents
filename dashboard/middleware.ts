import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = [
  "/login",
  "/api/auth/start",
  "/api/auth/verify",
  "/api/auth/cognito",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(png|jpg|svg|ico|css|js|map)$/)
  ) {
    return NextResponse.next();
  }

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Cognito OAuth callback page (under /login/cognito)
  if (pathname.startsWith("/login/")) {
    return NextResponse.next();
  }

  // Prava return can complete without session briefly — still require login.
  const token = req.cookies.get("limitx_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "Sign in to continue." },
        { status: 401 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
