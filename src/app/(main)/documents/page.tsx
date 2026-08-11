import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { DocumentsClient } from "@/components/documents/documents-client";
import { getGlobalRoleLabel } from "@/types";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { id: string; isSuperadmin: boolean; isGlobalInspector: boolean };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Dokumen" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <DocumentsClient />
      </div>
    </div>
  );
}
