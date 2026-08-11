import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { ClientPortalClient } from "@/components/client-portal/client-portal-client";
import { getGlobalRoleLabel } from "@/types";

export default async function ClientPortalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { id: string; isSuperadmin: boolean; isGlobalInspector: boolean };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Portal Client" icon={Building2} accent="amber" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <ClientPortalClient userId={user.id} />
      </div>
    </div>
  );
}
