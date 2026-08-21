import { prisma } from "@/lib/prisma";
import { getUserProjectIds, getUserProjectRole } from "@/lib/api-helpers";
import { deriveProjectCode } from "@/lib/services/document-code.service";
import { visibilityAllowlist, requiresApprovedOnly, resolveVisibilityBypass } from "@/lib/services/document.service";
import type { LpsPhase, ProjectStatus, Role } from "@prisma/client";
import type { ProjectRole } from "@/types";

// Appends a numeric suffix on a project_code collision (e.g. two projects both
// deriving to "LGM") — projectCode is required for document code generation,
// so every project must leave createProject with one.
async function generateUniqueProjectCode(name: string): Promise<string> {
  const base = deriveProjectCode(name);
  for (let suffix = 0; suffix < 10; suffix++) {
    const candidate = suffix === 0 ? base : `${base.slice(0, 2)}${suffix}`;
    const existing = await prisma.project.findUnique({ where: { projectCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Gagal membuat kode proyek unik");
}

const projectListInclude = {
  createdBy: { select: { id: true, name: true } },
  userRoles: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  phases: {
    orderBy: { phase: "asc" as const },
    // documentTypeId+status (not full document rows) is enough to compute
    // per-project completeness/deadline in JS below, in the same query that
    // already fetches phases — no per-project N+1 round-trip needed.
    include: { documents: { select: { documentTypeId: true, status: true } } },
  },
};

const projectDetailInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  userRoles: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  phases: {
    include: {
      documents: {
        include: {
          uploadedBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
          versions: {
            where: { isCurrent: true },
            take: 1,
            select: { id: true, versionNumber: true, filePath: true, createdAt: true },
          },
        },
        orderBy: { createdAt: "desc" as const },
      },
    },
    orderBy: { phase: "asc" as const },
  },
};

// Matches on documentTypeId (the 13-type master), not the legacy 4-value
// documentType enum — several PhaseRequiredDocument rows share the same legacy
// value (e.g. DES/RSF/GRD are all "FILE_UPLOAD"), which would collapse three
// distinct requirements into one and produce wrong completeness percentages.
export function attachCompleteness<T extends { phase: LpsPhase; documents: { documentTypeId: string | null; status: string }[] }>(
  phases: T[],
  requiredDocs: { phase: LpsPhase; documentTypeId: string | null; isOptional: boolean }[]
) {
  return phases.map((ph) => {
    const required = requiredDocs.filter((r) => r.phase === ph.phase && !r.isOptional);
    const approvedTypes = new Set(
      ph.documents.filter((d) => d.status === "APPROVED").map((d) => d.documentTypeId)
    );
    const fulfilled = required.filter((r) => r.documentTypeId && approvedTypes.has(r.documentTypeId)).length;
    return {
      ...ph,
      requiredDocs: required,
      completeness: {
        required: required.length,
        fulfilled,
        percent: required.length === 0 ? 100 : Math.round((fulfilled / required.length) * 100),
        isComplete: required.length === 0 || fulfilled === required.length,
      },
    };
  });
}

// Overall per-project completeness (aggregated across active phases) +
// deadline status — same fields the old standalone "Overview Proyek" page
// computed via its own privileged endpoint, now attached directly to every
// /api/projects response so card/list views work identically for every role
// without a second, differently-scoped fetch.
export function attachProjectSummary<
  T extends { status: string; targetEndDate: Date | null; phases: { phase: LpsPhase; isActive: boolean; documents: { documentTypeId: string | null; status: string }[] }[] }
>(projects: T[], requiredDocs: { phase: LpsPhase; documentTypeId: string | null; isOptional: boolean }[]) {
  const now = new Date();
  return projects.map((p) => {
    const activePhases = p.phases.filter((ph) => ph.isActive);
    const activeRequired = requiredDocs.filter((r) => !r.isOptional && activePhases.some((ph) => ph.phase === r.phase));
    const approvedTypes = new Set(
      activePhases.flatMap((ph) => ph.documents.filter((d) => d.status === "APPROVED").map((d) => d.documentTypeId))
    );
    const fulfilled = activeRequired.filter((r) => r.documentTypeId && approvedTypes.has(r.documentTypeId)).length;
    const completenessPercent =
      activePhases.length === 0 ? null : activeRequired.length === 0 ? 100 : Math.round((fulfilled / activeRequired.length) * 100);

    let deadlineStatus: "ok" | "approaching" | "overdue" = "ok";
    if (p.targetEndDate && p.status !== "COMPLETED") {
      const daysLeft = Math.ceil((p.targetEndDate.getTime() - now.getTime()) / 86400000);
      if (daysLeft < 0) deadlineStatus = "overdue";
      else if (daysLeft <= 14) deadlineStatus = "approaching";
    }

    return { ...p, completenessPercent, deadlineStatus };
  });
}

// "leader" kept as an alias for TEAM_LEADER for backward compatibility with
// existing bookmarked links/API callers.
const FILTERABLE_ROLES: Role[] = ["TEAM_LEADER", "ENGINEER", "INSPECTOR", "CLIENT"];

export async function listProjects(user: { id: string; isSuperadmin: boolean }, filter: string | null) {
  const roleFilter: Role | null = filter === "leader" ? "TEAM_LEADER" : FILTERABLE_ROLES.includes(filter as Role) ? (filter as Role) : null;

  let projects;
  if (user.isSuperadmin) {
    projects = await prisma.project.findMany({ include: projectListInclude, orderBy: { createdAt: "desc" } });
  } else if (roleFilter) {
    const ids = await getUserProjectIds(user.id, [roleFilter]);
    projects = await prisma.project.findMany({
      where: { id: { in: ids } },
      include: projectListInclude,
      orderBy: { createdAt: "desc" },
    });
  } else {
    const ids = await getUserProjectIds(user.id, ["TEAM_LEADER", "ENGINEER", "INSPECTOR", "CLIENT"]);
    projects = await prisma.project.findMany({
      where: {
        OR: [{ createdById: user.id }, { id: { in: ids } }],
      },
      include: projectListInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  const requiredDocs = await prisma.phaseRequiredDocument.findMany({ where: { isOptional: false } });
  return attachProjectSummary(projects, requiredDocs);
}

export async function createProject(userId: string, data: {
  name: string;
  description?: string;
  client: string;
  location?: string;
  startDate?: string;
  targetEndDate?: string;
}) {
  const projectCode = await generateUniqueProjectCode(data.name);

  const project = await prisma.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        name: data.name,
        projectCode,
        description: data.description,
        client: data.client,
        location: data.location,
        status: "PLANNING" as ProjectStatus,
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
        createdById: userId,
      },
    });

    await tx.userRole.create({
      data: { userId, projectId: newProject.id, role: "TEAM_LEADER" },
    });

    await tx.projectPhase.createMany({
      data: [
        { projectId: newProject.id, phase: "INISIASI", isActive: false },
        { projectId: newProject.id, phase: "ASSESSMENT", isActive: false },
        { projectId: newProject.id, phase: "DESIGN", isActive: false },
        { projectId: newProject.id, phase: "IMPLEMENTASI", isActive: false },
        { projectId: newProject.id, phase: "COMMISSIONING", isActive: false },
        { projectId: newProject.id, phase: "INSPEKSI_BERKALA", isActive: false },
      ],
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "CREATE",
        entity: "project",
        entityId: newProject.id,
        projectId: newProject.id,
        detail: { name: data.name },
      },
    });

    return newProject;
  });

  return prisma.project.findUnique({ where: { id: project.id }, include: projectListInclude });
}

export function listPhaseRequiredDocuments(phase: LpsPhase | null) {
  return prisma.phaseRequiredDocument.findMany({
    where: { ...(phase && { phase }) },
    orderBy: [{ phase: "asc" }, { label: "asc" }],
  });
}

export async function canAccessProject(user: { id: string; isSuperadmin: boolean }, projectId: string) {
  if (user.isSuperadmin) return true;
  // getUserProjectRole already resolves the global INSPECTOR role against any project
  const role = await getUserProjectRole(user.id, projectId);
  if (role) return true;
  const project = await prisma.project.findFirst({ where: { id: projectId, createdById: user.id } });
  return !!project;
}

export async function getProjectById(id: string, viewerRole: Role | null, bypassVisibility: boolean) {
  const project = await prisma.project.findUnique({ where: { id }, include: projectDetailInclude });
  if (!project) return null;

  const requiredDocs = await prisma.phaseRequiredDocument.findMany({
    orderBy: [{ phase: "asc" }, { label: "asc" }],
  });

  // A CLIENT (or any lower-clearance viewer) must never receive internal
  // drafts/contracts/cost documents in the raw payload, not just have them
  // hidden by the client-portal UI — filter server-side per document.
  const bypassVisibilityTier = bypassVisibility || resolveVisibilityBypass(viewerRole, project);
  const allowlist = bypassVisibilityTier ? null : visibilityAllowlist(viewerRole);
  const approvedOnly = !bypassVisibility && requiresApprovedOnly(viewerRole);
  const phases = allowlist
    ? project.phases.map((ph) => ({
        ...ph,
        documents: ph.documents.filter((d) => allowlist.includes(d.visibility) && (!approvedOnly || d.status === "APPROVED")),
      }))
    : project.phases;

  return { ...project, phases: attachCompleteness(phases, requiredDocs) };
}

export async function updateProject(id: string, actor: { id: string; isSuperadmin: boolean }, data: {
  name?: string;
  description?: string;
  client?: string;
  location?: string;
  status?: string;
  startDate?: string | null;
  targetEndDate?: string | null;
  inspectorSeesAllDocuments?: boolean;
  clientSeesAllDocuments?: boolean;
}) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return { error: "not_found" as const };

  const role = await getUserProjectRole(actor.id, id);
  if (!actor.isSuperadmin && project.createdById !== actor.id && role !== "TEAM_LEADER") {
    return { error: "forbidden" as const };
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.client !== undefined && { client: data.client }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.status && { status: data.status as any }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(data.targetEndDate !== undefined && { targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null }),
      ...(data.inspectorSeesAllDocuments !== undefined && { inspectorSeesAllDocuments: data.inspectorSeesAllDocuments }),
      ...(data.clientSeesAllDocuments !== undefined && { clientSeesAllDocuments: data.clientSeesAllDocuments }),
    },
  });

  await prisma.auditLog.create({
    data: { actorId: actor.id, action: "EDIT", entity: "project", entityId: id, projectId: id, detail: data },
  });

  return { project: updated };
}

/**
 * Deleting a project cascades (schema-level ON DELETE CASCADE) to every one
 * of its documents, permanently — bypassing the retention/legal-hold logic
 * deleteOrArchiveDocument() applies when a document is deleted individually
 * (DRAFT only is hard-deleted, anything else is archived, legal_hold blocks
 * deletion entirely). Apply that same policy here before the cascade runs:
 * a project can only be hard-deleted if it has no legal-hold documents and
 * no document has left DRAFT — i.e. it never accumulated real project
 * history worth preserving. A project with real history should be archived
 * (ProjectStatus.ARCHIVED), not deleted.
 */
export async function deleteProject(id: string) {
  const documents = await prisma.document.findMany({
    where: { projectId: id },
    select: { legalHold: true, status: true },
  });
  if (documents.some((d) => d.legalHold)) return { error: "legal_hold" as const };
  if (documents.some((d) => d.status !== "DRAFT")) return { error: "has_history" as const };

  await prisma.project.delete({ where: { id } });
  return { success: true as const };
}

export function listProjectMembers(projectId: string) {
  return prisma.userRole.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function addProjectMember(params: { projectId: string; userId: string; role: ProjectRole; actorId: string }): Promise<
  { error: string } | { member: Awaited<ReturnType<typeof listProjectMembers>>[number] }
> {
  const targetUser = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!targetUser) return { error: "User tidak ditemukan" };

  // A user may hold several roles on the same project (mis. Team Leader di satu
  // proyek, Engineer di proyek lain, atau lebih dari satu peran pada proyek yang
  // sama) — hanya kombinasi (user, proyek, role) yang identik yang ditolak,
  // dijaga juga oleh @@unique([userId, projectId, role]) di skema.
  const existing = await prisma.userRole.findFirst({
    where: { userId: params.userId, projectId: params.projectId, role: params.role },
  });
  if (existing) return { error: "User sudah memiliki peran ini pada proyek ini" };

  const member = await prisma.userRole.create({
    data: { projectId: params.projectId, userId: params.userId, role: params.role },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: "ASSIGN",
      entity: "project_member",
      entityId: member.id,
      projectId: params.projectId,
      detail: { userId: params.userId, role: params.role },
    },
  });

  return { member };
}

export function removeProjectMember(memberId: string) {
  return prisma.userRole.delete({ where: { id: memberId } });
}

export async function getProjectMemberRole(memberId: string) {
  const row = await prisma.userRole.findUnique({ where: { id: memberId }, select: { role: true } });
  return row?.role ?? null;
}

export async function listProjectPhases(projectId: string) {
  const phases = await prisma.projectPhase.findMany({
    where: { projectId },
    include: {
      documents: {
        select: { id: true, documentType: true, documentTypeId: true, documentCode: true, status: true, title: true },
      },
    },
    orderBy: { phase: "asc" },
  });

  const requiredDocs = await prisma.phaseRequiredDocument.findMany({
    orderBy: [{ phase: "asc" }, { label: "asc" }],
  });

  return attachCompleteness(phases, requiredDocs);
}

export async function updateProjectPhase(params: {
  projectId: string;
  actorId: string;
  phase: LpsPhase;
  isActive?: boolean;
  isSkipped?: boolean;
}) {
  const data: Record<string, boolean> = {};
  if (params.isActive !== undefined) data.isActive = params.isActive;
  if (params.isSkipped !== undefined) {
    data.isSkipped = params.isSkipped;
    if (params.isSkipped) data.isActive = false;
  }

  const updated = await prisma.projectPhase.update({
    where: { projectId_phase: { projectId: params.projectId, phase: params.phase } },
    data,
  });

  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: "PHASE_CHANGE",
      entity: "project_phase",
      entityId: updated.id,
      projectId: params.projectId,
      detail: { phase: params.phase, ...data },
    },
  });

  return updated;
}
