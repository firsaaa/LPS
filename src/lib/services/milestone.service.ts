import { prisma } from "@/lib/prisma";
import type { LpsPhase } from "@prisma/client";

export function listMilestones(projectId: string) {
  return prisma.milestone.findMany({
    where: { projectId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ isCompleted: "asc" }, { targetDate: "asc" }],
  });
}

export async function createMilestone(params: {
  projectId: string;
  actorId: string;
  title: string;
  description: string | null;
  phase: LpsPhase | null;
  targetDate: string | null;
}) {
  const milestone = await prisma.milestone.create({
    data: {
      projectId: params.projectId,
      title: params.title,
      description: params.description,
      phase: params.phase,
      targetDate: params.targetDate ? new Date(params.targetDate) : null,
      createdById: params.actorId,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: "CREATE",
      entity: "milestone",
      entityId: milestone.id,
      projectId: params.projectId,
      detail: { title: params.title },
    },
  });

  return milestone;
}

export async function updateMilestone(milestoneId: string, actorId: string, params: {
  title: string;
  description: string | null;
  phase: LpsPhase | null;
  targetDate: string | null;
}) {
  const existing = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!existing) return { error: "not_found" as const };

  const milestone = await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      title: params.title,
      description: params.description,
      phase: params.phase,
      targetDate: params.targetDate ? new Date(params.targetDate) : null,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "EDIT",
      entity: "milestone",
      entityId: milestoneId,
      projectId: existing.projectId,
      detail: { title: params.title },
    },
  });

  return { milestone };
}

export async function toggleMilestone(milestoneId: string, actorId: string, isCompleted: boolean) {
  const existing = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!existing) return { error: "not_found" as const };

  const milestone = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { isCompleted, completedAt: isCompleted ? new Date() : null },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "EDIT",
      entity: "milestone",
      entityId: milestoneId,
      projectId: existing.projectId,
      detail: { field: "isCompleted", from: existing.isCompleted, to: isCompleted },
    },
  });

  return { milestone };
}

export async function deleteMilestone(milestoneId: string, actorId: string) {
  const existing = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!existing) return { error: "not_found" as const };

  await prisma.$transaction([
    prisma.auditLog.create({
      data: { actorId, action: "DELETE", entity: "milestone", entityId: milestoneId, projectId: existing.projectId, detail: { title: existing.title } },
    }),
    prisma.milestone.delete({ where: { id: milestoneId } }),
  ]);

  return { success: true as const };
}

export function getMilestoneProjectId(milestoneId: string) {
  return prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } }).then((m) => m?.projectId ?? null);
}
