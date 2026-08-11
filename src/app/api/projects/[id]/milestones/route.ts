import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, forbidden, badRequest, ok, created } from "@/lib/api-helpers";
import { listMilestones, createMilestone } from "@/lib/services/milestone.service";
import type { LpsPhase } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  if (!user.isSuperadmin && !user.isGlobalInspector) {
    const role = await getUserProjectRole(user.id, projectId);
    if (!role) return forbidden();
  }

  const milestones = await listMilestones(projectId);
  return ok(milestones);
}

/** POST /api/projects/[id]/milestones — Team Leader (or Superadmin) only, same as phase activation. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const role = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { title, description, phase, targetDate } = body as {
    title?: string; description?: string | null; phase?: LpsPhase | null; targetDate?: string | null;
  };
  if (!title?.trim()) return badRequest("Judul milestone wajib diisi");

  const milestone = await createMilestone({
    projectId, actorId: user.id, title: title.trim(),
    description: description || null, phase: phase || null, targetDate: targetDate || null,
  });
  return created(milestone);
}
