import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, created, badRequest, forbidden, notFound } from "@/lib/api-helpers";
import { getDocumentWithProject } from "@/lib/services/document.service";
import { attachTag, detachTag } from "@/lib/services/tag.service";

/** POST /api/documents/[id]/tags — attach a tag (created if it doesn't exist). ENGINEER/TEAM_LEADER only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
  if (role !== "ENGINEER" && role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { name } = body as { name: string };
  if (!name) return badRequest("Nama tag wajib diisi");

  const result = await attachTag(documentId, name, user.id);
  if ("error" in result) return badRequest(result.error);

  return created(result.documentTag);
}

/** DELETE /api/documents/[id]/tags — detach a tag. ENGINEER/TEAM_LEADER only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
  if (role !== "ENGINEER" && role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { tagId } = body as { tagId: string };
  if (!tagId) return badRequest("tagId wajib diisi");

  const result = await detachTag(documentId, tagId);
  if ("error" in result) return notFound("Tag tidak ditemukan pada dokumen ini");

  return ok({ success: true });
}
