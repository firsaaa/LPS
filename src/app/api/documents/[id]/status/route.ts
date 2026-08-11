import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, badRequest, forbidden, notFound } from "@/lib/api-helpers";
import { getDocumentWithProject, updateCurrentVersionStatus } from "@/lib/services/document.service";

/** PUT /api/documents/[id]/status — changes the active version's status. TEAM_LEADER/INSPECTOR only. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
  if (role !== "TEAM_LEADER" && role !== "INSPECTOR") return forbidden();

  const body = await req.json();
  const { status } = body as { status: string };
  if (!status) return badRequest("status wajib diisi");

  const result = await updateCurrentVersionStatus(documentId, user.id, status);
  if ("error" in result) {
    if (result.error === "not_found") return notFound("Versi dokumen aktif tidak ditemukan");
    return badRequest("Status tidak valid (DRAFT|IN_REVIEW|APPROVED|SUPERSEDED|OBSOLETE)");
  }

  return ok(result.version);
}
