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
    // API callers expect a 401 they can branch on, not a redirect — a fetch()
    // client that doesn't follow redirects (or follows them and gets HTML
    // back) would otherwise see a confusing non-JSON 200/307 instead of a
    // clear "you're not logged in".
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // The three multipart-upload routes are excluded here — Next.js's proxy
  // layer fully buffers the request body before handing off to the route
  // handler, regardless of what the handler itself does with it. That
  // defeated the streaming multipart parser in upload-stream.ts entirely: a
  // 150MB upload still spiked server RSS by ~400MB even though the route
  // handler never held more than a few KB at once — confirmed by excluding
  // these paths here and re-measuring (dropped to the same ~30MB baseline as
  // a trivial request). All three routes already call getSessionUser() and
  // reject unauthenticated requests themselves (same as every other route in
  // this API — see orientasi.md §2), so auth coverage isn't lost by skipping
  // this middleware for them, only the body-buffering step is.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/projects/.*/documents|api/documents/.*/version|api/projects/.*/notulen).*)",
  ],
};
