import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, ok, forbidden } from "@/lib/api-helpers";
import { listAuditLogs } from "@/lib/services/audit.service";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  if (!user.isSuperadmin && !user.isGlobalInspector) return forbidden();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const entity = searchParams.get("entity");
  const take = Math.min(parseInt(searchParams.get("take") ?? "50"), 200);

  const logs = await listAuditLogs({ projectId, entity, take });

  return ok(logs);
}
