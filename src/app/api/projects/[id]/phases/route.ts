import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, forbidden, badRequest } from "@/lib/api-helpers";
import { listProjectPhases, updateProjectPhase } from "@/lib/services/project.service";
import type { LpsPhase } from "@prisma/client";

/** GET /api/projects/[id]/phases — list all phases with completeness info */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const result = await listProjectPhases(projectId);

  return ok(result);
}

/** PATCH /api/projects/[id]/phases — toggle isActive on a phase */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const role = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { phase, isActive, isSkipped } = body as {
    phase: LpsPhase; isActive?: boolean; isSkipped?: boolean;
  };
  if (!phase || (isActive === undefined && isSkipped === undefined)) {
    return badRequest("phase dan isActive/isSkipped wajib diisi");
  }

  const updated = await updateProjectPhase({ projectId, actorId: user.id, phase, isActive, isSkipped });

  return ok(updated);
}
