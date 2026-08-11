import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no Prisma or bcrypt
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [],
  pages: { signIn: "/login" },
  // Railway (like most PaaS hosts) terminates TLS at its own edge proxy and
  // forwards plain HTTP internally — NextAuth sees that internal Host header
  // and, without this, refuses it as untrusted since it doesn't match
  // NEXTAUTH_URL exactly. Safe here because Railway's proxy is what's
  // actually terminating the public connection, not an arbitrary client.
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/login";
      if (isLoginPage) return isLoggedIn ? Response.redirect(new URL("/", nextUrl)) : true;
      return isLoggedIn;
    },
  },
};
