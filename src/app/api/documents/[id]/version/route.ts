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
import { getDocumentWithProject, listDocumentVersions, createDocumentVersion, canViewDocument, resolveVisibilityBypass } from "@/lib/services/document.service";
import { parseMultipartUpload, cleanupTempUpload } from "@/lib/upload-stream";
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
    if (!canViewDocument(role, doc.visibility, doc.status, resolveVisibilityBypass(role, doc.projectPhase.project))) return forbidden();
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

  const parsed = await parseMultipartUpload(req, {
    maxFileBytes: MAX_UPLOAD_SIZE_BYTES,
    isAllowedFilename: isAllowedUploadFilename,
  });
  if ("error" in parsed) {
    return badRequest(parsed.error === "too_large" ? "Ukuran file maksimal 200MB" : "Tipe file tidak didukung");
  }
  const { fields, file } = parsed;
  if (!file) return badRequest("File wajib diupload");
  const changeNotes = fields.changeNotes || null;

  const newVersion = await createDocumentVersion({
    documentId, actorId: user.id, projectId,
    file: { tempPath: file.tempPath, originalName: file.originalName, size: file.size },
    changeNotes,
  });

  return created(newVersion);
}
