import { NextRequest } from "next/server";
import {
  getSessionUser,
  getUserProjectRole,
  unauthorized,
  forbidden,
  badRequest,
  notFound,
  ok,
} from "@/lib/api-helpers";
import { getDocumentWithProject, updateDocumentStatus } from "@/lib/services/document.service";
import type { DocumentStatus } from "@prisma/client";

// Alur: DRAFT -> UNDER_REVIEW -> APPROVED -> ARCHIVED. "submit" memindahkan
// DRAFT langsung ke UNDER_REVIEW (tidak ada status SUBMITTED terpisah lagi).
// REVISION_REQUESTED dan REJECTED sama-sama kembali lewat "submit" setelah
// diperbaiki — bedanya di makna: revisi = arahnya sudah benar tinggal
// diperbaiki, ditolak = perlu ditinjau ulang dari awal.
const VALID_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REVISION_REQUESTED", "REJECTED"],
  APPROVED: ["ARCHIVED"],
  REVISION_REQUESTED: ["UNDER_REVIEW"],
  REJECTED: ["UNDER_REVIEW"],
  ARCHIVED: [],
};

const ACTION_MAP: Record<string, DocumentStatus> = {
  submit: "UNDER_REVIEW",
  approve: "APPROVED",
  revise: "REVISION_REQUESTED",
  reject: "REJECTED",
  archive: "ARCHIVED",
};

const STATUS_LABEL_ID: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  UNDER_REVIEW: "Sedang Direview",
  APPROVED: "Disetujui",
  REVISION_REQUESTED: "Perlu Revisi",
  REJECTED: "Ditolak",
  ARCHIVED: "Diarsipkan",
};

/** POST /api/documents/[id]/approve — advance document status */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const projectId = doc.projectPhase.projectId;
  // Superadmin is read-only — document workflow belongs to the project team
  if (user.isSuperadmin) return forbidden();
  const role = await getUserProjectRole(user.id, projectId);
  if (!role) return forbidden();

  const body = await req.json();
  const { action } = body as { action: string };
  const targetStatus = ACTION_MAP[action];
  if (!targetStatus) return badRequest("action tidak valid (submit|approve|revise|reject|archive)");

  const allowed = VALID_TRANSITIONS[doc.status];
  if (!allowed.includes(targetStatus)) {
    return badRequest(
      `Dokumen berstatus "${STATUS_LABEL_ID[doc.status]}" tidak bisa diubah ke "${STATUS_LABEL_ID[targetStatus]}"`
    );
  }

  // Role checks per action
  if (action === "submit" && role !== "ENGINEER" && role !== "TEAM_LEADER") {
    return forbidden();
  }
  // Approval sits with the project's own Team Leader — Inspector's role is
  // cross-project compliance oversight (see /inspector), not sitting in a
  // single project's sign-off chain.
  if ((action === "approve" || action === "revise" || action === "reject") &&
    role !== "TEAM_LEADER") {
    return forbidden();
  }
  if (action === "archive" && role !== "TEAM_LEADER") {
    return forbidden();
  }

  const AUDIT_ACTION_MAP: Record<string, "SUBMIT" | "APPROVE" | "REVISE" | "REJECT" | "ARCHIVE"> = {
    submit: "SUBMIT", approve: "APPROVE", revise: "REVISE", reject: "REJECT", archive: "ARCHIVE",
  };
  const auditAction = AUDIT_ACTION_MAP[action];

  const updated = await updateDocumentStatus({
    documentId, actorId: user.id, projectId, fromStatus: doc.status, targetStatus, auditAction,
  });

  return ok(updated);
}
