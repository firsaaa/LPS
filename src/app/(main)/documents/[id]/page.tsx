import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { DocumentDetailClient } from "@/components/documents/document-detail-client";
import { getGlobalRoleLabel } from "@/types";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { id: string; isSuperadmin: boolean; isGlobalInspector: boolean };
  const { id } = await params;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Detail Dokumen" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <DocumentDetailClient documentId={id} userId={user.id} />
      </div>
    </div>
  );
}
