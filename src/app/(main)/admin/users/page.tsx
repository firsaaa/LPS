import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { Header } from "@/components/layout/header";
import { UsersClient } from "@/components/admin/users-client";
import { getGlobalRoleLabel } from "@/types";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { isSuperadmin: boolean; isGlobalInspector: boolean };
  if (!user.isSuperadmin) redirect("/");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Manajemen User" icon={Users} accent="red" globalRoleLabel={getGlobalRoleLabel(user)} />
      <div className="flex-1 overflow-y-auto p-6">
        <UsersClient />
      </div>
    </div>
  );
}
