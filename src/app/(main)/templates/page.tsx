import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { getGlobalRoleLabel } from "@/types";

export default async function TemplatesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { isSuperadmin: boolean; isGlobalInspector: boolean };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Template Dokumen" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-gray-500">Template dokumen tidak termasuk dalam scope TA ini.</p>
      </div>
    </div>
  );
}
