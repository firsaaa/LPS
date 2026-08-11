import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserRoleProfile } from "@/lib/api-helpers";

// Lands everyone on the first item their OWN sidebar actually shows (see
// Sidebar's isPureClient) — a pure Client's sidebar is Portal Client alone,
// everyone else's is "Dashboard" (/projects). Single source of truth so
// login doesn't have to duplicate this logic.
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.isSuperadmin || user.isGlobalInspector || user.canLeadProject) {
    redirect("/projects");
  }

  const { hasInternalRole, hasClientRole } = await getUserRoleProfile(user.id);
  const isPureClient = !hasInternalRole && hasClientRole;
  redirect(isPureClient ? "/client" : "/projects");
}
