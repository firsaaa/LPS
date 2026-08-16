import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, created, badRequest, forbidden, notFound } from "@/lib/api-helpers";
import { getDocumentWithProject, canViewDocument, getDocumentDetail } from "@/lib/services/document.service";
import { listDocumentReferences, addDocumentReference } from "@/lib/services/document-reference.service";

/** GET /api/documents/[id]/references — dokumen yang jadi dasar ini, dan dokumen yang menjadikan ini dasarnya. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  if (!user.isSuperadmin) {
    const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
    if (!role) return forbidden();
    const full = await getDocumentDetail(documentId);
    if (!full || !canViewDocument(role, full.visibility, full.status)) return forbidden();
  }

  const result = await listDocumentReferences(documentId);
  return ok(result);
}

/** POST /api/documents/[id]/references — tautkan dokumen ini sebagai BASED_ON dokumen lain. ENGINEER/TEAM_LEADER only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
  if (role !== "ENGINEER" && role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { referencedDocumentId } = body as { referencedDocumentId: string };
  if (!referencedDocumentId) return badRequest("referencedDocumentId wajib diisi");

  const result = await addDocumentReference({ documentId, referencedDocumentId, actorId: user.id });
  if ("error" in result) {
    return badRequest(
      result.error === "self_reference" ? "Dokumen tidak bisa menjadi dasar untuk dirinya sendiri"
      : result.error === "different_project" ? "Dokumen dasar harus berada di proyek yang sama"
      : result.error === "already_linked" ? "Referensi ini sudah ada"
      : "Dokumen dasar tidak ditemukan"
    );
  }

  return created(result.reference);
}
