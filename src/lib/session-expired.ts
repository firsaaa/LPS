import { signOut } from "next-auth/react";

/**
 * Call when an API route returns 401 to a client component. A raw redirect to
 * /login isn't enough — proxy.ts only checks whether the JWT is structurally
 * valid, not whether the user it points to still exists, so a stale session
 * (e.g. after a dev DB reset) gets bounced straight back to /dashboard from
 * /login. Clearing the session first breaks that loop.
 */
export function handleSessionExpired() {
  signOut({ callbackUrl: "/login" });
}
