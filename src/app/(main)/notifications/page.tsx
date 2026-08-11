import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { NotificationsClient } from "@/components/notifications/notifications-client";
import { getGlobalRoleLabel } from "@/types";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { isSuperadmin: boolean; isGlobalInspector: boolean };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Notifikasi" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <NotificationsClient />
      </div>
    </div>
  );
}
