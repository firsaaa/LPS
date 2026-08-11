import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        // Fetch fresh from DB on every sign-in so role data is always accurate
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        const globalRoles = await prisma.userRole.findMany({ where: { userId: user.id, projectId: null } });
        token.id = user.id;
        token.isSuperadmin = globalRoles.some((r) => r.role === "SUPERADMIN");
        token.isGlobalInspector = globalRoles.some((r) => r.role === "INSPECTOR");
        token.canLeadProject = dbUser?.canLeadProject ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as any).isSuperadmin = token.isSuperadmin ?? false;
        (session.user as any).isGlobalInspector = token.isGlobalInspector ?? false;
        (session.user as any).canLeadProject = token.canLeadProject ?? false;
      }
      return session;
    },
  },
});
