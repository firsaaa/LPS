import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, isAllowedUploadFilename, unauthorized, ok, created, badRequest, forbidden } from "@/lib/api-helpers";
import { listProjectDocuments, createProjectDocument } from "@/lib/services/document.service";
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

  const role = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && role !== "ENGINEER" && role !== "TEAM_LEADER") return forbidden();

  const formData = await req.formData();
  const phaseStr = formData.get("phase") as string | null;
  const documentTypeId = formData.get("documentTypeId") as string | null;
  const title = formData.get("title") as string | null;
  const description = formData.get("description") as string | null;
  const visibility = (formData.get("visibility") as DocumentVisibility) ?? "INTERNAL";
  const assignedToId = formData.get("assignedToId") as string | null;
  const file = formData.get("file") as File | null;

  if (!phaseStr || !documentTypeId || !title) {
    return badRequest("phase, documentTypeId, dan title wajib diisi");
  }

  let fileData: { buffer: Buffer; originalName: string } | null = null;
  if (file) {
    if (file.size > MAX_UPLOAD_SIZE_BYTES) return badRequest("Ukuran file maksimal 200MB");
    if (!isAllowedUploadFilename(file.name)) return badRequest("Tipe file tidak didukung");
    const bytes = await file.arrayBuffer();
    fileData = { buffer: Buffer.from(bytes), originalName: file.name };
  }

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
