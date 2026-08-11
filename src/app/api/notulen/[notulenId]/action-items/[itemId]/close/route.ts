import { NextRequest } from "next/server";
import {
  getSessionUser, getUserProjectRole,
  unauthorized, forbidden, notFound, ok,
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

  const updated = await toggleActionItem({
    notulenId,
    itemId,
    requestedLinkedDocumentId: body.linkedDocumentId ?? null,
    closedNote: body.closedNote ?? null,
  });
  if (!updated) return notFound("Action item tidak ditemukan");

  return ok(updated);
}
