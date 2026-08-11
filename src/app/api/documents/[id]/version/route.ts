import { NextRequest } from "next/server";
import {
  getSessionUser,
  getUserProjectRole,
  isAllowedUploadFilename,
  unauthorized,
  ok,
  created,
  badRequest,
  forbidden,
  notFound,
} from "@/lib/api-helpers";
import { getDocumentWithProject, listDocumentVersions, createDocumentVersion, canViewDocument } from "@/lib/services/document.service";
import { MAX_UPLOAD_SIZE_BYTES } from "@/types";

/** GET /api/documents/[id]/version — list all versions */
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const projectId = doc.projectPhase.projectId;

  if (!user.isSuperadmin) {
    const role = await getUserProjectRole(user.id, projectId);
    if (!role) return forbidden();
    if (!canViewDocument(role, doc.visibility, doc.status)) return forbidden();
  }

  const versions = await listDocumentVersions(documentId);

  return ok(versions);
}

/** POST /api/documents/[id]/version — upload a new version */
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

  if (!user.isSuperadmin) {
    const role = await getUserProjectRole(user.id, projectId);
    if (role !== "ENGINEER" && role !== "TEAM_LEADER") return forbidden();
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const changeNotes = formData.get("changeNotes") as string | null;

  if (!file) return badRequest("File wajib diupload");
  if (file.size > MAX_UPLOAD_SIZE_BYTES) return badRequest("Ukuran file maksimal 200MB");
  if (!isAllowedUploadFilename(file.name)) return badRequest("Tipe file tidak didukung");

  const buffer = Buffer.from(await file.arrayBuffer());

  const newVersion = await createDocumentVersion({
    documentId, actorId: user.id, projectId,
    file: { buffer, originalName: file.name },
    changeNotes,
  });

  return created(newVersion);
}
