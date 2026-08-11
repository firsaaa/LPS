import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getGlobalRoleLabel } from "@/types";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { id: string; isSuperadmin: boolean; isGlobalInspector: boolean; canLeadProject: boolean };
  const { id } = await params;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Workspace Proyek" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto">
        <ProjectWorkspace
          projectId={id}
          userId={user.id}
          isSuperadmin={user.isSuperadmin}
          isGlobalInspector={user.isGlobalInspector}
          canLeadProject={user.canLeadProject}
        />
      </div>
    </div>
  );
}
