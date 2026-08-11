import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, forbidden, notFound, badRequest } from "@/lib/api-helpers";
import { getDocumentDetail, getDocumentWithProject, canViewDocument, deleteOrArchiveDocument } from "@/lib/services/document.service";

/** GET /api/documents/[id] — full detail for the document detail page. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const doc = await getDocumentDetail(id);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.project.id);

  if (!user.isSuperadmin) {
    if (!role) return forbidden();
    if (!canViewDocument(role, doc.visibility, doc.status)) return forbidden();
  }

  return ok({ ...doc, viewerRole: role, viewerIsSuperadmin: user.isSuperadmin });
}

/**
 * DELETE /api/documents/[id] — a Team Leader can remove/archive any document;
 * the uploader may only remove their own DRAFT (not yet part of the formal
 * record). Everything past DRAFT is archived rather than destroyed — see
 * deleteOrArchiveDocument().
 */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const doc = await getDocumentWithProject(id);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
  const isTeamLeader = user.isSuperadmin || role === "TEAM_LEADER";
  const isOwnerOfDraft = doc.status === "DRAFT" && doc.uploadedById === user.id;
  if (!isTeamLeader && !isOwnerOfDraft) return forbidden();

  const result = await deleteOrArchiveDocument(id, user.id);
  if ("error" in result) {
    return badRequest(
      result.error === "legal_hold" ? "Dokumen ini ditahan (legal hold) — tidak dapat dihapus atau diarsipkan"
      : result.error === "already_archived" ? "Dokumen sudah diarsipkan"
      : "Dokumen tidak ditemukan"
    );
  }
  return ok(result);
}
