import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, forbidden, badRequest, created } from "@/lib/api-helpers";
import { createDocumentAssignment } from "@/lib/services/notulen.service";
import { listDocumentTypeMasters } from "@/lib/services/document.service";
import { LPS_PHASES } from "@/types";

/** POST /api/projects/[id]/documents/assign — Team Leader assigns "upload X by date Y" to an Engineer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const role = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && role !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { assignedToId, deadline, phase, documentTypeId, note } = body as {
    assignedToId?: string; deadline?: string | null; phase?: string; documentTypeId?: string; note?: string | null;
  };
  if (!assignedToId || !phase || !documentTypeId) {
    return badRequest("assignedToId, phase, dan documentTypeId wajib diisi");
  }

  const types = await listDocumentTypeMasters();
  const type = types.find((t) => t.id === documentTypeId);
  if (!type) return badRequest("Jenis dokumen tidak ditemukan");

  const phaseLabel = LPS_PHASES.find((p) => p.phase === phase)?.label ?? phase;

  const item = await createDocumentAssignment({
    projectId, actorId: user.id, assignedToId,
    deadline: deadline || null, phase, documentTypeId,
    documentTypeName: type.name, phaseLabel, note: note || null,
  });

  return created(item);
}
