import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, forbidden, notFound, badRequest, ok } from "@/lib/api-helpers";
import { updateNotulen, getNotulenProjectId } from "@/lib/services/notulen.service";

/** PATCH /api/notulen/[notulenId] — edit an already-recorded notulen. Same authors as create (not Client, not Superadmin/Inspector). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ notulenId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.isSuperadmin || user.isGlobalInspector) return forbidden();
  const { notulenId } = await params;

  const existing = await getNotulenProjectId(notulenId);
  if (!existing) return notFound("Notulen tidak ditemukan");

  const role = await getUserProjectRole(user.id, existing.projectId);
  if (!role || role === "CLIENT") return forbidden();

  const body = await req.json();
  const { title, meetingType, meetingDate, location, attendees, discussion } = body as {
    title?: string; meetingType?: string | null; meetingDate?: string;
    location?: string | null; attendees?: string | null; discussion?: string | null;
  };
  if (!title || !meetingDate) return badRequest("Judul dan tanggal rapat wajib diisi");

  const result = await updateNotulen(notulenId, user.id, {
    title, meetingType: meetingType || null, meetingDate,
    location: location || null, attendees: attendees || null, discussion: discussion || null,
  });
  if ("error" in result) return notFound("Notulen tidak ditemukan");

  return ok(result.notulen);
}
