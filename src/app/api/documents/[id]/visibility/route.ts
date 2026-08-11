import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, badRequest, forbidden, notFound } from "@/lib/api-helpers";
import { getDocumentWithProject, updateDocumentVisibility } from "@/lib/services/document.service";
import type { DocumentVisibility } from "@prisma/client";

const VALID_VISIBILITY: DocumentVisibility[] = ["INTERNAL", "AUDITOR_ACCESSIBLE", "CLIENT_ACCESSIBLE", "ALL_ACCESSIBLE"];

/** PUT /api/documents/[id]/visibility — decides if the client can see this document. TEAM_LEADER only. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: documentId } = await params;

  const doc = await getDocumentWithProject(documentId);
  if (!doc) return notFound("Dokumen tidak ditemukan");

  const role = await getUserProjectRole(user.id, doc.projectPhase.projectId);
  if (role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { visibility } = body as { visibility: string };
  if (!VALID_VISIBILITY.includes(visibility as DocumentVisibility)) {
    return badRequest("Visibilitas tidak valid (INTERNAL|AUDITOR_ACCESSIBLE|CLIENT_ACCESSIBLE|ALL_ACCESSIBLE)");
  }

  const result = await updateDocumentVisibility(documentId, user.id, visibility as DocumentVisibility);
  if ("error" in result) return notFound("Dokumen tidak ditemukan");

  return ok(result.document);
}
