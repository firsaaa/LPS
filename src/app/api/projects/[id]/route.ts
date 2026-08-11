import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, notFound, forbidden } from "@/lib/api-helpers";
import { canAccessProject, getProjectById, updateProject, deleteProject } from "@/lib/services/project.service";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  if (!(await canAccessProject(user, id))) return forbidden();

  // Documents are filtered per-document by the viewer's role below (mis. a
  // CLIENT must never see internal drafts/contracts in the raw payload, not
  // just have them hidden by the UI) — see getProjectById().
  const role = await getUserProjectRole(user.id, id);
  const project = await getProjectById(id, role, user.isSuperadmin);
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
  if (!user.isSuperadmin) return forbidden();

  const { id } = await params;
  await deleteProject(id);
  return ok({ success: true });
}
