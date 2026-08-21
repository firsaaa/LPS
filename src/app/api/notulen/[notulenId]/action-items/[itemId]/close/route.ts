import { NextRequest } from "next/server";
import {
  getSessionUser, getUserProjectRole,
  unauthorized, forbidden, notFound, ok, badRequest,
} from "@/lib/api-helpers";
import { getNotulenProjectId, toggleActionItem } from "@/lib/services/notulen.service";

/** POST — toggle action item open/closed, optionally linking a project document as evidence */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ notulenId: string; itemId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.isSuperadmin || user.isGlobalInspector) return forbidden();

  const { notulenId, itemId } = await params;

  const notulen = await getNotulenProjectId(notulenId);
  if (!notulen) return notFound("Notulen tidak ditemukan");

  const role = await getUserProjectRole(user.id, notulen.projectId);
  if (!role || role === "CLIENT") return forbidden();

  const body = await req.json().catch(() => ({}));

  const result = await toggleActionItem({
    notulenId,
    itemId,
    requestedLinkedDocumentId: body.linkedDocumentId ?? null,
    closedNote: body.closedNote ?? null,
  });
  if ("error" in result) {
    if (result.error === "not_found") return notFound("Action item tidak ditemukan");
    if (result.error === "evidence_required") return badRequest("Tindak lanjut ini mensyaratkan dokumen bukti — lampirkan dokumen dulu sebelum menutup");
    return badRequest("Dokumen yang dilampirkan bukan jenis yang disyaratkan untuk tindak lanjut ini");
  }

  return ok(result);
}
