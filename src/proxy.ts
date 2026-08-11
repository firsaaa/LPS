import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Railway (and most PaaS hosts) terminate TLS at their own edge and forward
  // plain HTTP internally, so the request this middleware sees looks like
  // http:// even though the client connected over https://. getToken() uses
  // the request's apparent protocol to decide whether to look for the
  // `__Secure-`-prefixed cookie NextAuth actually set — without this override
  // it looks for the wrong cookie name and treats every logged-in user as
  // logged out. NEXTAUTH_URL is the source of truth for what's actually public.
  const secureCookie = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, secureCookie });
  const isLoggedIn = !!token;
  const isLoginPage = pathname.startsWith("/login");

  if (isLoginPage) {
    // "/" picks the right landing page per role (see src/app/page.tsx) — this
    // edge middleware has no DB access to make that call itself.
    return isLoggedIn
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
