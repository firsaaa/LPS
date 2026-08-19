import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, forbidden } from "@/lib/api-helpers";
import { listAuditLogs } from "@/lib/services/audit.service";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  // Scoped to one project: any internal team member of THAT project (Team
  // Leader/Engineer) can see its own history — this is what powers the
  // "Riwayat" tab on the project workspace page, previously 403'd for
  // everyone except Superadmin/Inspector even when viewing their own project.
  // Unscoped (no projectId = cross-project): stays Superadmin/Inspector only.
  if (projectId) {
    if (!user.isSuperadmin && !user.isGlobalInspector) {
      const role = await getUserProjectRole(user.id, projectId);
      if (!role || role === "CLIENT") return forbidden();
    }
  } else if (!user.isSuperadmin && !user.isGlobalInspector) {
    return forbidden();
  }

  const entity = searchParams.get("entity");
  const take = Math.min(parseInt(searchParams.get("take") ?? "50"), 200);

  const logs = await listAuditLogs({ projectId, entity, take });

  return ok(logs);
}
