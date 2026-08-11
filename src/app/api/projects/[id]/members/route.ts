import { NextRequest } from "next/server";
import { getSessionUser, getUserProjectRole, unauthorized, ok, created, badRequest, forbidden } from "@/lib/api-helpers";
import { listProjectMembers, addProjectMember, removeProjectMember, getProjectMemberRole } from "@/lib/services/project.service";
import type { ProjectRole } from "@/types";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const members = await listProjectMembers(projectId);
  return ok(members);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const leaderRole = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && leaderRole !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { userId, role } = body as { userId: string; role: ProjectRole };
  if (!userId || !role) return badRequest("userId dan role wajib diisi");

  // A project's own Team Leader manages their team (Engineer/Client), but
  // cannot unilaterally appoint a co-Team-Leader with equal authority over
  // the same project — that's an org-level decision reserved for Superadmin.
  if (role === "TEAM_LEADER" && !user.isSuperadmin) {
    return forbidden();
  }

  const result = await addProjectMember({ projectId, userId, role, actorId: user.id });
  if ("error" in result) return badRequest(result.error);

  return created(result.member);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id: projectId } = await params;

  const leaderRole = await getUserProjectRole(user.id, projectId);
  if (!user.isSuperadmin && leaderRole !== "TEAM_LEADER") return forbidden();

  const body = await req.json();
  const { memberId } = body as { memberId: string };

  // Same boundary as POST: a Team Leader can remove their own Engineers/Clients,
  // but cannot remove a fellow Team Leader — only Superadmin can.
  if (!user.isSuperadmin) {
    const targetRole = await getProjectMemberRole(memberId);
    if (targetRole === "TEAM_LEADER") return forbidden();
  }

  await removeProjectMember(memberId);
  return ok({ success: true });
}
