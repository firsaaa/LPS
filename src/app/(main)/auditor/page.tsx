import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Header } from "@/components/layout/header";
import { AuditorClient } from "@/components/auditor/auditor-client";
import { getGlobalRoleLabel } from "@/types";

export default async function AuditorPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { isSuperadmin: boolean; isGlobalInspector: boolean };

  if (!user.isSuperadmin && !user.isGlobalInspector) redirect("/");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Pusat Kepatuhan" icon={ShieldCheck} accent="purple" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <AuditorClient />
      </div>
    </div>
  );
}
