import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, forbidden, notFound } from "@/lib/api-helpers";
import { getDocumentWithProject } from "@/lib/services/document.service";
import { removeDocumentReference } from "@/lib/services/document-reference.service";

/** DELETE /api/documents/[id]/references/[refId] — putuskan tautan. ENGINEER/TEAM_LEADER only. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId, refId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
  if (role !== "ENGINEER" && role !== "TEAM_LEADER") return forbidden();

  const result = await removeDocumentReference(refId, user.id);
  if ("error" in result) return notFound("Referensi tidak ditemukan");

  return ok({ success: true });
}
