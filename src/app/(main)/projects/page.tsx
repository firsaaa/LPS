import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { Header } from "@/components/layout/header";
import { ProjectsClient } from "@/components/projects/projects-client";
import { getGlobalRoleLabel } from "@/types";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { id: string; isSuperadmin: boolean; isGlobalInspector: boolean; canLeadProject: boolean };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Dashboard" icon={LayoutDashboard} accent="blue" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <ProjectsClient userId={user.id} canLeadProject={user.canLeadProject} />
      </div>
    </div>
  );
}
