import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { getUserRoleProfile } from "@/lib/api-helpers";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as { id: string; name: string; email: string; isSuperadmin: boolean; isGlobalInspector: boolean; canLeadProject: boolean };
  const { hasInternalRole, hasClientRole } = await getUserRoleProfile(user.id);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        isSuperadmin={user.isSuperadmin ?? false}
        isGlobalInspector={user.isGlobalInspector ?? false}
        canLeadProject={user.canLeadProject ?? false}
        hasInternalRole={hasInternalRole}
        hasClientRole={hasClientRole}
        userName={user.name ?? ""}
        userEmail={user.email ?? ""}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
