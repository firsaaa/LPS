import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, forbidden } from "@/lib/api-helpers";
import { getTraceabilityMetrics } from "@/lib/services/document-reference.service";

/** GET /api/projects/[id]/traceability — M-1 Traceability Coverage & M-2 Lifecycle Integration Level. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  if (!user.isSuperadmin) {
    const role = await getUserProjectRole(user.id, projectId);
    if (!role || role === "CLIENT") return forbidden();
  }

  const metrics = await getTraceabilityMetrics(projectId);
  return ok(metrics);
}
