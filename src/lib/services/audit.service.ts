import { prisma } from "@/lib/prisma";

export async function listAuditLogs(params: { projectId?: string | null; entity?: string | null; take: number }) {
  const { projectId, entity, take } = params;

  return prisma.auditLog.findMany({
    where: {
      ...(projectId && { projectId }),
      ...(entity && { entity }),
    },
    include: {
      actor: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
