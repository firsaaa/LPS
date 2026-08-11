import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no Prisma or bcrypt
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [],
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/login";
      if (isLoginPage) return isLoggedIn ? Response.redirect(new URL("/", nextUrl)) : true;
      return isLoggedIn;
    },
  },
};
