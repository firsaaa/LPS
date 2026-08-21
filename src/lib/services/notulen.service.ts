import { prisma } from "@/lib/prisma";

const notulenInclude = {
  createdBy: { select: { id: true, name: true } },
  actionItems: {
    include: {
      assignedTo: { select: { id: true, name: true } },
      linkedDocument: { select: { id: true, title: true, filePath: true, status: true } },
      requiredDocumentType: { select: { id: true, name: true, typeCode: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

export function listNotulenForProject(projectId: string) {
  return prisma.notulen.findMany({
    where: { projectId },
    include: notulenInclude,
    orderBy: { meetingDate: "desc" },
  });
}

export async function createNotulen(params: {
  projectId: string;
  userId: string;
  title: string;
  meetingType: string | null;
  meetingDate: string;
  location: string | null;
  attendees: string | null;
  discussion: string | null;
  filePath: string | null;
  actionItems: {
    description: string;
    assignedToId?: string | null;
    deadline?: string | null;
    requiredPhase?: string | null;
    requiredDocumentTypeId?: string | null;
  }[];
}) {
  const notulen = await prisma.notulen.create({
    data: {
      projectId: params.projectId,
      title: params.title,
      meetingType: params.meetingType,
      meetingDate: new Date(params.meetingDate),
      location: params.location,
      attendees: params.attendees,
      discussion: params.discussion,
      filePath: params.filePath,
      createdById: params.userId,
      actionItems: {
        create: (params.actionItems ?? []).map((item) => ({
          description: item.description,
          assignedToId: item.assignedToId || null,
          deadline: item.deadline ? new Date(item.deadline) : null,
          requiredPhase: (item.requiredPhase as any) || null,
          requiredDocumentTypeId: item.requiredDocumentTypeId || null,
        })),
      },
    },
    include: notulenInclude,
  });

  await prisma.auditLog.create({
    data: {
      actorId: params.userId,
      action: "CREATE",
      entity: "notulen",
      entityId: notulen.id,
      projectId: params.projectId,
      detail: { title: params.title, meetingDate: params.meetingDate },
    },
  });

  return notulen;
}

export async function updateNotulen(notulenId: string, actorId: string, params: {
  title: string;
  meetingType: string | null;
  meetingDate: string;
  location: string | null;
  attendees: string | null;
  discussion: string | null;
}) {
  const existing = await prisma.notulen.findUnique({ where: { id: notulenId } });
  if (!existing) return { error: "not_found" as const };

  const notulen = await prisma.notulen.update({
    where: { id: notulenId },
    data: {
      title: params.title,
      meetingType: params.meetingType,
      meetingDate: new Date(params.meetingDate),
      location: params.location,
      attendees: params.attendees,
      discussion: params.discussion,
    },
    include: notulenInclude,
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "EDIT",
      entity: "notulen",
      entityId: notulenId,
      projectId: existing.projectId,
      detail: { title: params.title },
    },
  });

  return { notulen };
}

export function getNotulenProjectId(notulenId: string) {
  return prisma.notulen.findUnique({ where: { id: notulenId }, select: { projectId: true } });
}

// Every ActionItem must belong to a Notulen (schema constraint from the original
// meeting-minutes design). Direct "assign this document to an engineer" requests
// — a lighter-weight action than recording a full meeting — reuse one shared
// running log per project instead of creating a new "meeting" each time.
const ASSIGNMENT_LOG_TITLE = "Penugasan Dokumen";

async function findOrCreateAssignmentLog(projectId: string, actorId: string) {
  const existing = await prisma.notulen.findFirst({ where: { projectId, title: ASSIGNMENT_LOG_TITLE } });
  if (existing) return existing;
  return prisma.notulen.create({
    data: {
      projectId,
      title: ASSIGNMENT_LOG_TITLE,
      meetingDate: new Date(),
      discussion: "Daftar penugasan dokumen langsung dari Team Leader ke Engineer (di luar notulen rapat).",
      createdById: actorId,
    },
  });
}

/** Direct "assign this document to an engineer" shortcut — surfaces in the assignee's Notifikasi. */
export async function createDocumentAssignment(params: {
  projectId: string;
  actorId: string;
  assignedToId: string;
  deadline: string | null;
  phase: string;
  documentTypeId: string;
  documentTypeName: string;
  phaseLabel: string;
  note: string | null;
}) {
  const log = await findOrCreateAssignmentLog(params.projectId, params.actorId);

  const description = params.note?.trim()
    ? params.note.trim()
    : `Upload ${params.documentTypeName} untuk fase ${params.phaseLabel}`;

  const item = await prisma.actionItem.create({
    data: {
      notulenId: log.id,
      description,
      assignedToId: params.assignedToId,
      deadline: params.deadline ? new Date(params.deadline) : null,
      requiredPhase: params.phase as any,
      requiredDocumentTypeId: params.documentTypeId,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      requiredDocumentType: { select: { id: true, name: true, typeCode: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: "ASSIGN",
      entity: "action_item",
      entityId: item.id,
      projectId: params.projectId,
      detail: { description, assignedToId: params.assignedToId, phase: params.phase, documentTypeId: params.documentTypeId },
    },
  });

  return item;
}

export async function toggleActionItem(params: {
  notulenId: string;
  itemId: string;
  requestedLinkedDocumentId: string | null;
  closedNote: string | null;
}): Promise<{ error: "not_found" } | { error: "evidence_required" } | { error: "evidence_type_mismatch" } | Awaited<ReturnType<typeof updateActionItem>>> {
  const item = await prisma.actionItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.notulenId !== params.notulenId) return { error: "not_found" };

  const newStatus = item.status === "OPEN" ? "CLOSED" : "OPEN";

  let linkedDocumentId = params.requestedLinkedDocumentId ?? item.linkedDocumentId ?? null;
  if (newStatus === "OPEN") linkedDocumentId = null;

  let linkedDocTypeId: string | null = null;
  if (linkedDocumentId) {
    const notulen = await prisma.notulen.findUnique({ where: { id: params.notulenId }, select: { projectId: true } });
    const doc = await prisma.document.findFirst({
      where: { id: linkedDocumentId, projectPhase: { projectId: notulen?.projectId } },
      select: { id: true, documentTypeId: true },
    });
    if (!doc) linkedDocumentId = null;
    else linkedDocTypeId = doc.documentTypeId;
  }

  // FR-32: tindak lanjut yang mensyaratkan jenis dokumen bukti tertentu
  // (requiredDocumentTypeId, ditetapkan saat notulen dibuat — lihat FN-01)
  // tidak boleh ditutup tanpa bukti yang sesuai. Sebelumnya TIDAK ada
  // pemeriksaan ini sama sekali (temuan FN-04) — siapa pun bisa menutup
  // tindak lanjut tanpa benar-benar melampirkan bukti.
  if (newStatus === "CLOSED" && item.requiredDocumentTypeId) {
    if (!linkedDocumentId) return { error: "evidence_required" };
    if (linkedDocTypeId !== item.requiredDocumentTypeId) return { error: "evidence_type_mismatch" };
  }

  return updateActionItem(params.itemId, newStatus, linkedDocumentId, params.closedNote);
}

function updateActionItem(itemId: string, newStatus: "OPEN" | "CLOSED", linkedDocumentId: string | null, closedNote: string | null) {
  return prisma.actionItem.update({
    where: { id: itemId },
    data: {
      status: newStatus,
      closedAt: newStatus === "CLOSED" ? new Date() : null,
      closedNote: newStatus === "CLOSED" ? closedNote : null,
      linkedDocumentId,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      linkedDocument: { select: { id: true, title: true, filePath: true, status: true } },
      requiredDocumentType: { select: { id: true, name: true, typeCode: true } },
    },
  });
}
