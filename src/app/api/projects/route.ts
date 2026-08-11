import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, ok, created, badRequest } from "@/lib/api-helpers";
import { listProjects, createProject } from "@/lib/services/project.service";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter");

  const projects = await listProjects(user, filter);

  return ok(projects);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // Super Admin is deliberately excluded even though it bypasses most other
  // checks — creating a project would make it that project's Team Leader
  // (see createProject), and Super Admin's job here is assigning/overseeing
  // roles across every project, not leading one itself.
  if (!user.canLeadProject) {
    return badRequest("Hanya user dengan hak can_lead_project yang dapat membuat proyek");
  }

  const body = await req.json();
  const { name, description, client, location, startDate, targetEndDate } = body;
  if (!name) return badRequest("Nama proyek wajib diisi");
  if (!client) return badRequest("Nama klien wajib diisi");

  const full = await createProject(user.id, { name, description, client, location, startDate, targetEndDate });

  return created(full);
}
