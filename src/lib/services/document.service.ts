import { copyFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUploadsRoot } from "@/lib/storage";
import { getUserProjectIds, getUserRoleMap } from "@/lib/api-helpers";
import { generateDocumentCode } from "@/lib/services/document-code.service";
import { extractText, MAX_EXTRACT_BYTES } from "@/lib/services/text-extraction.service";
import { ocrPdf } from "@/lib/services/ocr.service";
import type { DocumentType, DocumentStatus, DocumentVisibility, LpsPhase, Role } from "@prisma/client";

// Setiap nilai DocumentVisibility = daftar tetap peran yang boleh melihatnya
// (lihat komentar enum di schema.prisma). TEAM_LEADER/ENGINEER selalu ada di
// keempatnya karena INTERNAL adalah baseline yang tidak pernah dicabut — dua
// toggle (Inspector, Client) di UI cuma MENAMBAH INSPECTOR dan/atau CLIENT ke
// baseline itu. SUPERADMIN sengaja tidak dimasukkan — dia melihat semua,
// digating terpisah oleh setiap caller (pola `!user.isSuperadmin && …`).
const VISIBILITY_VIEWERS: Record<DocumentVisibility, Role[]> = {
  INTERNAL: ["TEAM_LEADER", "ENGINEER"],
  AUDITOR_ACCESSIBLE: ["TEAM_LEADER", "ENGINEER", "INSPECTOR"],
  CLIENT_ACCESSIBLE: ["TEAM_LEADER", "ENGINEER", "CLIENT"],
  ALL_ACCESSIBLE: ["TEAM_LEADER", "ENGINEER", "INSPECTOR", "CLIENT"],
};

// Client hanya boleh melihat dokumen yang sudah final (APPROVED) — jangan
// sampai draft/dokumen yang masih direvisi ikut ter-expose hanya karena Team
// Leader sudah menandainya client-facing. INSPECTOR sengaja TIDAK kena gate
// ini: tugas Inspector justru me-review dan approve dokumen yang BELUM
// APPROVED (lihat updateDocumentStatus, alur APPROVE) — kalau ikut digate,
// Inspector tidak akan pernah bisa melihat dokumen yang perlu direview.
export function requiresApprovedOnly(viewerRole: Role | null): boolean {
  return viewerRole === "CLIENT";
}

/**
 * Saklar bulk per proyek (Project.inspectorSeesAllDocuments / clientSeesAllDocuments)
 * — kalau true untuk peran ini, lewati pemeriksaan tingkat visibilitas per-dokumen
 * sama sekali (Team Leader tidak perlu buka dokumen satu-satu). TIDAK melewati
 * gate APPROVED-only untuk Client (requiresApprovedOnly) — itu aturan kematangan
 * dokumen yang terpisah dari konfigurasi visibilitas.
 */
export function resolveVisibilityBypass(viewerRole: Role | null, project: { inspectorSeesAllDocuments: boolean; clientSeesAllDocuments: boolean } | null): boolean {
  if (!viewerRole || !project) return false;
  if (viewerRole === "INSPECTOR") return project.inspectorSeesAllDocuments;
  if (viewerRole === "CLIENT") return project.clientSeesAllDocuments;
  return false;
}

export function canViewDocument(viewerRole: Role | null, visibility: DocumentVisibility, status: DocumentStatus, bypassVisibilityTier = false): boolean {
  if (!viewerRole) return false;
  if (!bypassVisibilityTier && !VISIBILITY_VIEWERS[visibility].includes(viewerRole)) return false;
  if (requiresApprovedOnly(viewerRole) && status !== "APPROVED") return false;
  return true;
}

/** Daftar nilai DocumentVisibility yang boleh dilihat viewer — untuk filter Prisma `visibility: { in: … }` (belum termasuk gate status APPROVED-only, lihat requiresApprovedOnly/canViewDocument). */
export function visibilityAllowlist(viewerRole: Role | null, bypassVisibilityTier = false): DocumentVisibility[] {
  const ALL: DocumentVisibility[] = ["INTERNAL", "AUDITOR_ACCESSIBLE", "CLIENT_ACCESSIBLE", "ALL_ACCESSIBLE"];
  if (bypassVisibilityTier) return ALL;
  return (Object.keys(VISIBILITY_VIEWERS) as DocumentVisibility[]).filter((v) =>
    viewerRole ? VISIBILITY_VIEWERS[v].includes(viewerRole) : false
  );
}

/**
 * Peran yang dipakai untuk projectId tertentu saat resolusi harus jatuh ke
 * satu peran (mis. filter Prisma per-dokumen). TEAM_LEADER/ENGINEER selalu
 * melihat semuanya jadi selalu menang; INSPECTOR vs CLIENT (kombinasi langka —
 * lihat catatan di getUserProjectRole) diputus dengan memprioritaskan peran
 * proyek yang eksplisit di atas fallback INSPECTOR global.
 */
function effectiveRoleForProject(
  projectId: string | null,
  roleMap: Map<string, Role>,
  isGlobalInspector: boolean
): Role | null {
  const scoped = projectId ? roleMap.get(projectId) ?? null : null;
  if (!isGlobalInspector) return scoped;
  return scoped ?? "INSPECTOR";
}

// Embedded-text extraction (fast, synchronous) already ran and found nothing —
// for a PDF that usually means it's scanned/image-only. OCR is CPU-heavy
// (roughly 0.5-1s per page), so it never runs on the request path: the caller
// checks needsOcr() to decide what to store, then calls scheduleOcr() (once
// the document's id is known) to run it via after() in the background.
function needsOcr(ext: string, extractedText: string | null): boolean {
  return ext === "pdf" && !extractedText;
}

/** Nomor versi berikutnya — 1 bila dokumen belum punya versi sama sekali. */
export function getNextVersionNumber(latestVersionNumber: number | null | undefined): number {
  return (latestVersionNumber ?? 0) + 1;
}

// Reads the file itself (rather than taking a Buffer from the caller) so the
// request/response cycle never holds a large-file buffer just in case OCR
// ends up needing it — the read happens here, after the response is already
// sent (see next/server's after()), where a one-time memory cost is far less
// costly than during the concurrent-request-handling window.
function scheduleOcr(documentId: string, diskPath: string) {
  after(async () => {
    try {
      const buffer = await readFile(diskPath);
      const text = await ocrPdf(buffer);
      await prisma.document.update({ where: { id: documentId }, data: { contentText: text, contentTextPending: false } });
    } catch (e) {
      console.error(`OCR failed for document ${documentId}:`, e);
      await prisma.document.update({ where: { id: documentId }, data: { contentTextPending: false } }).catch(() => {});
    }
  });
}

// The stored filename embeds the document code + version so it's identifiable
// on disk and in any "Save As" dialog, without a separate lookup (FR: auto
// document number in filename).
function buildStoredFilename(documentCode: string, versionNumber: number, ext: string) {
  return `${documentCode}-v${versionNumber}.${ext}`;
}

// Copies from the already-on-disk temp file (written by the streaming
// multipart parser) rather than taking a Buffer — the caller never holds the
// whole upload in memory at once, which is the point (see upload-stream.ts).
async function saveUploadedFile(projectId: string, storedName: string, sourcePath: string) {
  const uploadDir = path.join(getUploadsRoot(), projectId);
  await mkdir(uploadDir, { recursive: true });
  const destPath = path.join(uploadDir, storedName);
  await copyFile(sourcePath, destPath);
  return { url: `/api/files/${projectId}/${storedName}`, diskPath: destPath };
}

// The upload UI now lets users pick directly from the 13-type master
// (Tahap 6, done). documentType is a legacy 4-value enum kept only for
// backward-compatible storage — derived FROM the chosen type_code, never
// the other way around, so it can no longer collapse distinct types
// (e.g. DES/RSF/GRD) into the same bucket and break completeness counts.
const CODE_TO_LEGACY_TYPE: Partial<Record<string, DocumentType>> = {
  RSK: "LAPORAN_ASSESSMENT_RISIKO",
  LOG: "LOG_COMMISSIONING",
  LIB: "LAPORAN_INSPEKSI_BERKALA",
};
function legacyTypeForCode(typeCode: string): DocumentType {
  return CODE_TO_LEGACY_TYPE[typeCode] ?? "FILE_UPLOAD";
}

function addYears(date: Date, years: number) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

const docInclude = {
  uploadedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  projectPhase: { select: { phase: true, isActive: true } },
  versions: {
    where: { isCurrent: true },
    take: 1,
    select: { id: true, versionNumber: true, filePath: true, createdAt: true },
  },
};

export async function searchDocuments(
  user: { id: string; isSuperadmin: boolean; isGlobalInspector: boolean },
  filters: { q?: string; projectId?: string | null; phase?: string | null; status?: string | null; documentType?: DocumentType | null }
) {
  let phaseIds: string[] | null = null;

  if (!user.isSuperadmin) {
    // getUserProjectIds already returns every project if the user holds the global INSPECTOR role
    const accessibleProjectIds = await getUserProjectIds(user.id, [
      "TEAM_LEADER", "ENGINEER", "INSPECTOR", "CLIENT",
    ]);

    const phaseWhere: any = { projectId: { in: accessibleProjectIds } };
    if (filters.projectId) phaseWhere.projectId = filters.projectId;
    if (filters.phase) phaseWhere.phase = filters.phase;

    const phases = await prisma.projectPhase.findMany({ where: phaseWhere, select: { id: true } });
    phaseIds = phases.map((p) => p.id);
  } else if (filters.projectId || filters.phase) {
    const phaseWhere: any = {};
    if (filters.projectId) phaseWhere.projectId = filters.projectId;
    if (filters.phase) phaseWhere.phase = filters.phase;
    const phases = await prisma.projectPhase.findMany({ where: phaseWhere, select: { id: true } });
    phaseIds = phases.map((p) => p.id);
  }

  // Resolved per-project (not one flag for the whole result set): a user who
  // is e.g. ENGINEER on project A but only CLIENT on project B must not have
  // project B's internal documents leak through just because they hold an
  // elevated role somewhere else — a single global "isClientRole" boolean
  // used to allow exactly that when results span multiple projects.
  const roleMap = user.isSuperadmin ? null : await getUserRoleMap(user.id);

  const results = await prisma.document.findMany({
    where: {
      ...(phaseIds !== null && { projectPhaseId: { in: phaseIds } }),
      ...(filters.documentType && { documentType: filters.documentType }),
      ...(filters.status && { status: filters.status as any }),
      ...(filters.q && {
        OR: [
          { title: { contains: filters.q, mode: "insensitive" } },
          { description: { contains: filters.q, mode: "insensitive" } },
        ],
      }),
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      projectPhase: {
        select: {
          id: true,
          phase: true,
          project: { select: { id: true, name: true, inspectorSeesAllDocuments: true, clientSeesAllDocuments: true } },
        },
      },
      versions: {
        where: { isCurrent: true },
        take: 1,
        select: { id: true, versionNumber: true, filePath: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (user.isSuperadmin) return results;
  return results.filter((d) => {
    const role = effectiveRoleForProject(d.projectPhase.project.id, roleMap!, user.isGlobalInspector);
    return canViewDocument(role, d.visibility, d.status, resolveVisibilityBypass(role, d.projectPhase.project));
  });
}

export function getDocumentWithProject(documentId: string) {
  return prisma.document.findUnique({
    where: { id: documentId },
    include: { projectPhase: { select: { projectId: true, project: { select: { inspectorSeesAllDocuments: true, clientSeesAllDocuments: true } } } } },
  });
}

/**
 * DELETE /api/documents/[id] — a draft hasn't entered the formal record yet,
 * so it can be removed permanently. Anything past DRAFT is part of the
 * project's audit trail/version history, so "delete" archives it instead
 * (status -> ARCHIVED) rather than destroying the record — consistent with
 * the retention/legal-hold fields the document already carries.
 */
export async function deleteOrArchiveDocument(documentId: string, actorId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, projectId: true, legalHold: true },
  });
  if (!doc) return { error: "not_found" as const };
  if (doc.legalHold) return { error: "legal_hold" as const };

  if (doc.status === "DRAFT") {
    await prisma.$transaction([
      prisma.auditLog.create({
        data: { actorId, action: "DELETE", entity: "document", entityId: documentId, projectId: doc.projectId, detail: { status: doc.status } },
      }),
      prisma.document.delete({ where: { id: documentId } }),
    ]);
    return { mode: "deleted" as const };
  }

  if (doc.status === "ARCHIVED") return { error: "already_archived" as const };

  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: documentId }, data: { status: "ARCHIVED" } });
    await tx.auditLog.create({
      data: { actorId, action: "ARCHIVE", entity: "document", entityId: documentId, projectId: doc.projectId, detail: { from: doc.status, to: "ARCHIVED" } },
    });
  });
  return { mode: "archived" as const };
}

export function listDocumentTypeMasters() {
  return prisma.documentTypeMaster.findMany({ orderBy: { name: "asc" } });
}

// Komentar Team Leader saat meminta revisi (action=revise) — sebelumnya
// dikirim oleh UI tapi diam-diam dibuang oleh approve/route.ts, tidak pernah
// tersimpan di mana pun. Sekarang disimpan di detail audit_log (tidak perlu
// kolom baru) dan diambil di sini untuk ditampilkan ke Engineer.
export async function getLatestRevisionNote(documentId: string) {
  const entry = await prisma.auditLog.findFirst({
    where: { entity: "document", entityId: documentId, action: "REVISE" },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true } } },
  });
  const notes = (entry?.detail as { notes?: string } | null)?.notes;
  if (!notes) return null;
  return { notes, actorName: entry!.actor?.name ?? null, createdAt: entry!.createdAt };
}

export function getDocumentDetail(documentId: string) {
  return prisma.document.findUnique({
    where: { id: documentId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      documentTypeMaster: true,
      tags: { include: { tag: true } },
      projectPhase: { select: { id: true, phase: true, project: { select: { id: true, name: true, inspectorSeesAllDocuments: true, clientSeesAllDocuments: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function updateDocumentStatus(params: {
  documentId: string;
  actorId: string;
  projectId: string;
  fromStatus: DocumentStatus;
  targetStatus: DocumentStatus;
  auditAction: "APPROVE" | "REVISE" | "SUBMIT" | "REJECT" | "ARCHIVE";
  notes?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const d = await tx.document.update({
      where: { id: params.documentId },
      data: {
        status: params.targetStatus,
        ...(params.auditAction === "APPROVE" || params.auditAction === "REVISE" || params.auditAction === "REJECT"
          ? { reviewedById: params.actorId, reviewedAt: new Date() }
          : {}),
      },
    });

    // Approving a document (via /approve, the Document-level workflow) previously
    // left DocumentVersion.approvedById/approvedAt untouched — those columns were
    // only ever written by the separate PUT /status (version-level) endpoint, so
    // "who approved this and when" had no answer on the approval path actually
    // used by the app. Mirror it onto the current version here.
    if (params.auditAction === "APPROVE") {
      await tx.documentVersion.updateMany({
        where: { documentId: params.documentId, isCurrent: true },
        data: { approvedById: params.actorId, approvedAt: new Date() },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.auditAction,
        entity: "document",
        entityId: params.documentId,
        projectId: params.projectId,
        detail: { from: params.fromStatus, to: params.targetStatus, ...(params.notes ? { notes: params.notes } : {}) },
      },
    });

    return d;
  });
}

export function listDocumentVersions(documentId: string) {
  return prisma.documentVersion.findMany({
    where: { documentId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { versionNumber: "desc" },
  });
}

export async function createDocumentVersion(params: {
  documentId: string;
  actorId: string;
  projectId: string;
  file: { tempPath: string; originalName: string; size: number };
  changeNotes: string | null;
}) {
  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: params.documentId },
    select: { documentCode: true },
  });
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId: params.documentId },
    orderBy: { versionNumber: "desc" },
  });
  const nextVersionNumber = getNextVersionNumber(latest?.versionNumber);

  const ext = params.file.originalName.split(".").pop()?.toLowerCase() ?? "bin";
  const storedName = buildStoredFilename(doc.documentCode, nextVersionNumber, ext);
  const saved = await saveUploadedFile(params.projectId, storedName, params.file.tempPath);
  const filePath = saved.url;
  const fileWithinExtractBound = params.file.size <= MAX_EXTRACT_BYTES;
  const contentText = fileWithinExtractBound
    ? await extractText(await readFile(params.file.tempPath), ext)
    : null;
  // See the same guard in createProjectDocument() — needsOcr() alone can't
  // tell "skipped, too big" from "attempted, found nothing".
  const ocrPending = fileWithinExtractBound ? needsOcr(ext, contentText) : false;
  await cleanupTempUpload(params.file.tempPath);
  if (ocrPending) scheduleOcr(params.documentId, saved.diskPath);

  return prisma.$transaction(async (tx) => {
    await tx.documentVersion.updateMany({
      where: { documentId: params.documentId, isCurrent: true },
      data: { isCurrent: false },
    });

    const version = await tx.documentVersion.create({
      data: {
        documentId: params.documentId,
        versionNumber: nextVersionNumber,
        filePath,
        changeNotes: params.changeNotes,
        isCurrent: true,
        createdById: params.actorId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    await tx.document.update({
      where: { id: params.documentId },
      data: { filePath, contentText, contentTextPending: ocrPending, status: "DRAFT" },
    });

    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        action: "EDIT",
        entity: "document",
        entityId: params.documentId,
        projectId: params.projectId,
        detail: { versionNumber: nextVersionNumber, changeNotes: params.changeNotes },
      },
    });

    return version;
  });
}

export async function listProjectDocuments(
  projectId: string,
  filters: { phase?: string | null; documentType?: DocumentType | null },
  viewerRole: Role | null,
  bypassVisibility: boolean
) {
  const phaseFilter = filters.phase
    ? await prisma.projectPhase.findMany({ where: { projectId, phase: filters.phase as any }, select: { id: true } })
    : await prisma.projectPhase.findMany({ where: { projectId }, select: { id: true } });

  const phaseIds = phaseFilter.map((p) => p.id);

  // Saklar bulk per proyek (Project.inspectorSeesAllDocuments/clientSeesAllDocuments)
  // — dicek di sini (bukan dibebankan ke tiap route pemanggil) supaya semua
  // jalur baca daftar dokumen proyek otomatis konsisten. Tidak melewati gate
  // APPROVED-only Client (requiresApprovedOnly tetap dievaluasi terpisah).
  const project = bypassVisibility ? null : await prisma.project.findUnique({
    where: { id: projectId },
    select: { inspectorSeesAllDocuments: true, clientSeesAllDocuments: true },
  });
  const bypassVisibilityTier = bypassVisibility || resolveVisibilityBypass(viewerRole, project);

  return prisma.document.findMany({
    where: {
      projectPhaseId: { in: phaseIds },
      ...(filters.documentType && { documentType: filters.documentType }),
      ...(!bypassVisibilityTier && { visibility: { in: visibilityAllowlist(viewerRole) } }),
      ...(!bypassVisibility && requiresApprovedOnly(viewerRole) && { status: "APPROVED" }),
    },
    include: docInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function createProjectDocument(params: {
  projectId: string;
  actorId: string;
  // Only a Team Leader (or Superadmin) can implicitly activate a phase by
  // uploading to it — an Engineer must wait for the Team Leader to flip
  // "Fase Aktif" on first, otherwise the toggle doesn't actually gate anything.
  canActivatePhase: boolean;
  phase: string;
  documentTypeId: string;
  title: string;
  description: string | null;
  visibility: DocumentVisibility;
  assignedToId: string | null;
  file: { tempPath: string; originalName: string; size: number } | null;
}) {
  let projectPhase = await prisma.projectPhase.findUnique({
    where: { projectId_phase: { projectId: params.projectId, phase: params.phase as any } },
  });
  if (!projectPhase) {
    await cleanupTempUpload(params.file?.tempPath);
    return { error: "not_found" as const };
  }

  if (!projectPhase.isActive) {
    if (!params.canActivatePhase) {
      await cleanupTempUpload(params.file?.tempPath);
      return { error: "phase_inactive" as const };
    }
    projectPhase = await prisma.projectPhase.update({
      where: { id: projectPhase.id },
      data: { isActive: true },
    });
  }

  const ext = params.file ? params.file.originalName.split(".").pop()?.toLowerCase() ?? "bin" : null;
  const fileWithinExtractBound = !!params.file && params.file.size <= MAX_EXTRACT_BYTES;
  // Only read the file into memory for extraction if it's small enough —
  // large files already skip extraction inside extractText() (MAX_EXTRACT_BYTES),
  // so there's no point paying for the read at all above that size.
  const contentText = fileWithinExtractBound
    ? await extractText(await readFile(params.file!.tempPath), ext!)
    : null;
  // needsOcr() can't tell "extraction found nothing" apart from "extraction
  // was never attempted because the file is huge" — gate on the same size
  // bound here too, otherwise a 150MB upload would trigger a background job
  // that reads the whole 150MB file into memory just to run OCR on it.
  const ocrPending = fileWithinExtractBound ? needsOcr(ext!, contentText) : false;

  const typeMaster = await prisma.documentTypeMaster.findUnique({ where: { id: params.documentTypeId } });
  if (!typeMaster) {
    await cleanupTempUpload(params.file?.tempPath);
    return { error: "invalid_type" as const };
  }
  const typeCode = typeMaster.typeCode;
  const legacyType = legacyTypeForCode(typeCode);
  const retentionUntil =
    typeMaster.retentionTrigger === "SYSTEM_END_OF_LIFE"
      ? null
      : typeMaster.retentionPeriodYears
      ? addYears(new Date(), typeMaster.retentionPeriodYears)
      : null;

  const MAX_ATTEMPTS = 3;
  let newDocId: string | null = null;
  let savedDiskPath: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !newDocId; attempt++) {
    const documentCode = await generateDocumentCode(params.projectId, params.phase as LpsPhase, typeCode);

    // File is named after the code once it's known, so it can only be written per-attempt.
    // A retry (extremely rare — see generateDocumentCode) leaves a harmless orphaned file
    // under the previous attempt's code. Copied from the temp file each attempt — the temp
    // file itself is only cleaned up once, after the loop (success or exhausted).
    let filePath: string | null = null;
    if (params.file) {
      const storedName = buildStoredFilename(documentCode, 1, ext!);
      const saved = await saveUploadedFile(params.projectId, storedName, params.file.tempPath);
      filePath = saved.url;
      savedDiskPath = saved.diskPath;
    }

    try {
      newDocId = await prisma.$transaction(async (tx) => {
        const newDoc = await tx.document.create({
          data: {
            projectId: params.projectId,
            projectPhaseId: projectPhase!.id,
            documentType: legacyType,
            documentTypeId: typeMaster.id,
            documentCode,
            retentionUntil,
            title: params.title,
            description: params.description,
            visibility: params.visibility,
            status: "DRAFT",
            filePath,
            contentText,
            contentTextPending: ocrPending,
            assignedToId: params.assignedToId,
            uploadedById: params.actorId,
          },
        });

        if (filePath) {
          await tx.documentVersion.create({
            data: {
              documentId: newDoc.id,
              versionNumber: 1,
              filePath,
              isCurrent: true,
              createdById: params.actorId,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: params.actorId,
            action: "CREATE",
            entity: "document",
            entityId: newDoc.id,
            projectId: params.projectId,
            detail: { title: params.title, documentTypeId: params.documentTypeId, phase: params.phase, documentCode },
          },
        });

        return newDoc.id;
      });
    } catch (e) {
      // Unique constraint race on document_code (extremely rare — generateDocumentCode
      // already uses a serializable transaction) — retry with a freshly computed code.
      if (attempt === MAX_ATTEMPTS) throw e;
    }
  }

  await cleanupTempUpload(params.file?.tempPath);
  if (ocrPending && savedDiskPath) scheduleOcr(newDocId!, savedDiskPath);

  const full = await prisma.document.findUnique({ where: { id: newDocId! }, include: docInclude });
  return { document: full };
}

async function cleanupTempUpload(tempPath: string | undefined) {
  if (tempPath) await unlink(tempPath).catch(() => {});
}

const searchInclude = {
  uploadedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  documentTypeMaster: true,
  tags: { include: { tag: true } },
  projectPhase: {
    select: { id: true, phase: true, project: { select: { id: true, name: true, inspectorSeesAllDocuments: true, clientSeesAllDocuments: true } } },
  },
  versions: {
    where: { isCurrent: true },
    take: 1,
    select: { id: true, versionNumber: true, filePath: true, status: true, createdAt: true },
  },
};

// Shows *why* a document matched without making the user open it — pulls a
// short window of text around the first hit, so a content-only match (title
// doesn't mention it) is still trustworthy at a glance.
function extractSnippet(text: string | null, keyword: string, contextChars = 70): string | null {
  if (!text || !keyword.trim()) return null;
  const idx = text.toLowerCase().indexOf(keyword.trim().toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + keyword.length + contextChars);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}

/** GET /api/documents/search — combinable filters (FR-05 + content search). */
export async function advancedSearchDocuments(
  user: { id: string; isSuperadmin: boolean; isGlobalInspector: boolean },
  filters: {
    // One unified "ctrl+F"-style keyword: matches title, document code, tag
    // name, OR file CONTENT (PDF/DOCX/XLSX/PPTX text extraction) — an
    // engineer who forgot a document's title/type should still find it by
    // typing something they remember from inside it.
    keyword?: string;
    projectId?: string;
    phase?: string;
    documentTypeId?: string;
    dateFrom?: string;
    dateTo?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    documentCode?: string;
    tags?: string[];
    status?: DocumentStatus;
    uploaderName?: string;
  }
) {
  let phaseIds: string[] | null = null;

  if (!user.isSuperadmin) {
    // getUserProjectIds already returns every project if the user holds the global INSPECTOR role
    const accessibleProjectIds = await getUserProjectIds(user.id, [
      "TEAM_LEADER", "ENGINEER", "INSPECTOR", "CLIENT",
    ]);
    const phaseWhere: any = { projectId: { in: accessibleProjectIds } };
    if (filters.projectId) phaseWhere.projectId = filters.projectId;
    if (filters.phase) phaseWhere.phase = filters.phase;
    const phases = await prisma.projectPhase.findMany({ where: phaseWhere, select: { id: true } });
    phaseIds = phases.map((p) => p.id);
  } else if (filters.projectId || filters.phase) {
    const phaseWhere: any = {};
    if (filters.projectId) phaseWhere.projectId = filters.projectId;
    if (filters.phase) phaseWhere.phase = filters.phase;
    const phases = await prisma.projectPhase.findMany({ where: phaseWhere, select: { id: true } });
    phaseIds = phases.map((p) => p.id);
  }

  // Resolved per-project below (see searchDocuments' comment on why a single
  // global flag is wrong once results can span multiple projects a user has
  // different roles on).
  const roleMap = user.isSuperadmin ? null : await getUserRoleMap(user.id);

  const tagNames = (filters.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);

  // Content matching goes through the content_tsv GENERATED column (GIN-indexed,
  // see schema) instead of an ILIKE scan of contentText — that column can be
  // tens of thousands of characters per document, so a per-query substring scan
  // gets linearly slower as documents accumulate/get OCR'd. plainto_tsquery
  // handles the user's raw keyword safely (parameterized, no string concat).
  let contentMatchIds: string[] = [];
  if (filters.keyword?.trim()) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM documents
      WHERE content_tsv @@ plainto_tsquery('simple', ${filters.keyword})
      LIMIT 500
    `;
    contentMatchIds = rows.map((r) => r.id);
  }

  // Document must have ALL requested tags (AND across tags, `some` per tag),
  // plus the broad keyword match (title OR code OR tag name OR content) — both
  // live in a single AND array since Prisma only keeps the last of duplicate keys.
  const andConditions: any[] = tagNames.map((name) => ({ tags: { some: { tag: { name } } } }));
  if (filters.keyword) {
    andConditions.push({
      OR: [
        { title: { contains: filters.keyword, mode: "insensitive" } },
        { documentCode: { contains: filters.keyword, mode: "insensitive" } },
        { tags: { some: { tag: { name: { contains: filters.keyword, mode: "insensitive" } } } } },
        ...(contentMatchIds.length > 0 ? [{ id: { in: contentMatchIds } }] : []),
      ],
    });
  }

  const results = await prisma.document.findMany({
    where: {
      ...(phaseIds !== null && { projectPhaseId: { in: phaseIds } }),
      ...(filters.documentTypeId && { documentTypeId: filters.documentTypeId }),
      ...(filters.documentCode && { documentCode: { contains: filters.documentCode, mode: "insensitive" } }),
      ...(filters.status && { status: filters.status }),
      ...(filters.uploaderName && { uploadedBy: { name: { contains: filters.uploaderName, mode: "insensitive" } } }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      }),
      ...((filters.dueDateFrom || filters.dueDateTo) && {
        dueDate: {
          ...(filters.dueDateFrom && { gte: new Date(filters.dueDateFrom) }),
          ...(filters.dueDateTo && { lte: new Date(filters.dueDateTo) }),
        },
      }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    },
    include: searchInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const visible = user.isSuperadmin
    ? results
    : results.filter((d) => {
        const role = effectiveRoleForProject(d.projectPhase.project.id, roleMap!, user.isGlobalInspector);
        return canViewDocument(role, d.visibility, d.status, resolveVisibilityBypass(role, d.projectPhase.project));
      });

  // contentText itself can be tens of thousands of characters — never send it
  // whole to the client, only the short snippet around the match (if any).
  return visible.map((doc) => {
    const { contentText, ...rest } = doc;
    return { ...rest, contentSnippet: filters.keyword ? extractSnippet(contentText, filters.keyword) : null };
  });
}

const VERSION_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "SUPERSEDED", "OBSOLETE"];

/** PUT /api/documents/[id]/status — changes the active version's lifecycle status (FR-14). */
export async function updateCurrentVersionStatus(documentId: string, actorId: string, newStatus: string) {
  if (!VERSION_STATUSES.includes(newStatus)) return { error: "invalid_status" as const };

  const currentVersion = await prisma.documentVersion.findFirst({ where: { documentId, isCurrent: true } });
  if (!currentVersion) return { error: "not_found" as const };

  const updated = await prisma.$transaction(async (tx) => {
    const version = await tx.documentVersion.update({
      where: { id: currentVersion.id },
      data: {
        status: newStatus,
        ...(newStatus === "APPROVED" ? { approvedById: actorId, approvedAt: new Date() } : {}),
      },
    });

    const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId }, select: { projectId: true } });

    await tx.auditLog.create({
      data: {
        actorId,
        action: newStatus === "APPROVED" ? "APPROVE" : "EDIT",
        entity: "document_version",
        entityId: version.id,
        projectId: doc.projectId,
        detail: { from: currentVersion.status, to: newStatus },
      },
    });

    return version;
  });

  return { version: updated };
}

/** PATCH /api/documents/[id]/visibility — Team Leader decides what the client can see, not the uploader. */
export async function updateDocumentVisibility(documentId: string, actorId: string, visibility: DocumentVisibility) {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { projectId: true, visibility: true } });
  if (!doc) return { error: "not_found" as const };

  const updated = await prisma.document.update({ where: { id: documentId }, data: { visibility } });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "EDIT",
      entity: "document",
      entityId: documentId,
      projectId: doc.projectId,
      detail: { field: "visibility", from: doc.visibility, to: visibility },
    },
  });

  return { document: updated };
}
