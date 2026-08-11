import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { Header } from "@/components/layout/header";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getGlobalRoleLabel } from "@/types";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { id: string; isSuperadmin: boolean; isGlobalInspector: boolean; canLeadProject: boolean };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Proyek" icon={FolderKanban} accent="blue" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <DashboardClient userId={user.id} canLeadProject={user.canLeadProject} />
      </div>
    </div>
  );
}
