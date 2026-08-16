import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, isAllowedUploadFilename, unauthorized, ok, created, badRequest, forbidden } from "@/lib/api-helpers";
import { listProjectDocuments, createProjectDocument } from "@/lib/services/document.service";
import { parseMultipartUpload, cleanupTempUpload } from "@/lib/upload-stream";
import { MAX_UPLOAD_SIZE_BYTES } from "@/types";
import type { DocumentType, DocumentVisibility } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const { searchParams } = new URL(req.url);
  const phase = searchParams.get("phase");
  const documentType = searchParams.get("documentType") as DocumentType | null;

  const role = await getUserProjectRole(user.id, projectId);
  const documents = await listProjectDocuments(projectId, { phase, documentType }, role, user.isSuperadmin);

  return ok(documents);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  // Superadmin is read-only/administrative — document workflow belongs to the
  // project team, same reasoning as /approve (see that route's comment).
  if (user.isSuperadmin) return forbidden();
  const role = await getUserProjectRole(user.id, projectId);
  if (role !== "ENGINEER" && role !== "TEAM_LEADER") return forbidden();

  // Streams the multipart body straight to a temp file instead of buffering
  // the whole request in memory (req.formData() would) — see upload-stream.ts.
  const parsed = await parseMultipartUpload(req, {
    maxFileBytes: MAX_UPLOAD_SIZE_BYTES,
    isAllowedFilename: isAllowedUploadFilename,
  });
  if ("error" in parsed) {
    return badRequest(parsed.error === "too_large" ? "Ukuran file maksimal 200MB" : "Tipe file tidak didukung");
  }
  const { fields, file } = parsed;
  const phaseStr = fields.phase ?? null;
  const documentTypeId = fields.documentTypeId ?? null;
  const title = fields.title ?? null;
  const description = fields.description ?? null;
  const visibility = (fields.visibility as DocumentVisibility) ?? "INTERNAL";
  const assignedToId = fields.assignedToId || null;

  if (!phaseStr || !documentTypeId || !title) {
    await cleanupTempUpload(file?.tempPath);
    return badRequest("phase, documentTypeId, dan title wajib diisi");
  }

  const fileData = file ? { tempPath: file.tempPath, originalName: file.originalName, size: file.size } : null;

  const result = await createProjectDocument({
    projectId,
    actorId: user.id,
    canActivatePhase: user.isSuperadmin || role === "TEAM_LEADER",
    phase: phaseStr,
    documentTypeId,
    title,
    description,
    visibility,
    assignedToId: assignedToId || null,
    file: fileData,
  });
  if ("error" in result) {
    return badRequest(
      result.error === "invalid_type" ? "Jenis dokumen tidak ditemukan"
      : result.error === "phase_inactive" ? "Fase ini belum diaktifkan oleh Team Leader — minta Team Leader menyalakan \"Fase Aktif\" dulu sebelum upload"
      : "Fase tidak ditemukan di proyek ini"
    );
  }

  return created(result.document);
}
