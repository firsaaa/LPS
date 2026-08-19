import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, notFound, forbidden, badRequest } from "@/lib/api-helpers";
import { canAccessProject, getProjectById, updateProject, deleteProject } from "@/lib/services/project.service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  if (!(await canAccessProject(user, id))) return forbidden();

  // Documents are filtered per-document by the viewer's role below (mis. a
  // CLIENT must never see internal drafts/contracts in the raw payload, not
  // just have them hidden by the UI) — see getProjectById().
  let role = await getUserProjectRole(user.id, id);
  let bypassVisibility = user.isSuperadmin;

  // Portal Client preview (?previewAs=client): lets Team Leader/Superadmin see
  // exactly what their Client sees, instead of their own unrestricted view —
  // this is the ONLY way that preview means anything, since without it the
  // API just returns everything they're personally allowed to see. A real
  // CLIENT ignoring/passing this param makes no difference (their own role
  // already resolves to CLIENT), so it's safe to honor unconditionally.
  if (new URL(req.url).searchParams.get("previewAs") === "client" && (user.isSuperadmin || role === "TEAM_LEADER")) {
    role = "CLIENT";
    bypassVisibility = false;
  }

  const project = await getProjectById(id, role, bypassVisibility);
  if (!project) return notFound("Proyek tidak ditemukan");

  return ok(project);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = await req.json();

  const result = await updateProject(id, user, body);
  if ("error" in result) {
    if (result.error === "not_found") return notFound("Proyek tidak ditemukan");
    return forbidden();
  }

  return ok(result.project);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  // Team Leader can delete their own project, same as Superadmin — the real
  // safety net is inside deleteProject() (rejects if the project has any
  // non-draft/legal-hold document), not who's allowed to call this.
  if (!user.isSuperadmin) {
    const role = await getUserProjectRole(user.id, id);
    if (role !== "TEAM_LEADER") return forbidden();
  }

  const result = await deleteProject(id);
  if ("error" in result) {
    return badRequest(
      result.error === "legal_hold"
        ? "Proyek memiliki dokumen yang ditandai wajib disimpan (legal hold) — tidak bisa dihapus"
        : "Proyek memiliki riwayat dokumen (sudah ada yang bukan draft) — arsipkan proyek ini alih-alih menghapusnya"
    );
  }
  return ok({ success: true });
}
