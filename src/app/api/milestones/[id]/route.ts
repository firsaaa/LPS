import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, forbidden, notFound, badRequest, ok } from "@/lib/api-helpers";
import { toggleMilestone, updateMilestone, deleteMilestone, getMilestoneProjectId } from "@/lib/services/milestone.service";
import type { LpsPhase } from "@prisma/client";

/**
 * PATCH /api/milestones/[id] — Team Leader (or Superadmin) only. Two shapes:
 * `{ isCompleted }` toggles complete/incomplete; `{ title, ... }` edits the
 * milestone's own fields (title/description/phase/targetDate).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: milestoneId } = await params;

  const projectId = await getMilestoneProjectId(milestoneId);
  if (!projectId) return notFound("Milestone tidak ditemukan");

  const role = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();

  if (typeof body.isCompleted === "boolean") {
    const result = await toggleMilestone(milestoneId, user.id, body.isCompleted);
    if ("error" in result) return notFound("Milestone tidak ditemukan");
    return ok(result.milestone);
  }

  const { title, description, phase, targetDate } = body as {
    title?: string; description?: string | null; phase?: LpsPhase | null; targetDate?: string | null;
  };
  if (!title?.trim()) return badRequest("Judul milestone wajib diisi");

  const result = await updateMilestone(milestoneId, user.id, {
    title: title.trim(), description: description || null, phase: phase || null, targetDate: targetDate || null,
  });
  if ("error" in result) return notFound("Milestone tidak ditemukan");

  return ok(result.milestone);
}

/** DELETE /api/milestones/[id] — Team Leader (or Superadmin) only. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: milestoneId } = await params;

  const projectId = await getMilestoneProjectId(milestoneId);
  if (!projectId) return notFound("Milestone tidak ditemukan");

  const role = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && role !== "TEAM_LEADER") return forbidden();

  const result = await deleteMilestone(milestoneId, user.id);
  if ("error" in result) return notFound("Milestone tidak ditemukan");

  return ok(result);
}
