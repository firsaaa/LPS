import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@/types";
import type { Role } from "@prisma/client";

/** Server-side enforcement of the upload allowlist — the client's `accept` attribute is a UX hint, not a guard. */
export function isAllowedUploadFilename(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return !!ext && ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
}

const PROJECT_SCOPED_ROLES: Role[] = ["TEAM_LEADER", "ENGINEER", "CLIENT"];

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user) return null;

  const sessionId = (session.user as any).id as string | undefined;
  if (!sessionId) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionId },
  });
  if (!dbUser || !dbUser.isActive) return null;

  const globalRoles = await prisma.userRole.findMany({ where: { userId: dbUser.id, projectId: null } });
  const isSuperadmin = globalRoles.some((r) => r.role === "SUPERADMIN");
  const isGlobalInspector = globalRoles.some((r) => r.role === "INSPECTOR");

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    canLeadProject: dbUser.canLeadProject,
    isSuperadmin,
    isGlobalInspector,
  };
}

// Priority when a user holds more than one project-scoped role and code asks
// for a single "effective" role (mis. `role !== "TEAM_LEADER"` checks) — the
// most privileged role wins, so multi-role users still pass checks a
// single-role Team Leader or Engineer would pass.
const ROLE_PRIORITY: Role[] = ["TEAM_LEADER", "ENGINEER", "CLIENT"];

/**
 * All project-scoped roles a user holds on a project, plus the global
 * INSPECTOR role if applicable. A user may hold more than one role on the
 * same project at once (mis. Team Leader AND Engineer) — this returns every
 * one of them, unlike getUserProjectRole() which collapses to a single value.
 */
export async function getUserProjectRoles(userId: string, projectId: string): Promise<Role[]> {
  const scoped = await prisma.userRole.findMany({
    where: { userId, projectId, role: { in: PROJECT_SCOPED_ROLES } },
    select: { role: true },
  });
  const roles = scoped.map((r) => r.role);

  const globalInspector = await prisma.userRole.findFirst({
    where: { userId, projectId: null, role: "INSPECTOR" },
  });
  if (globalInspector) roles.push("INSPECTOR");

  return roles;
}

/**
 * Coarse role shape used only to decide what the sidebar shows — a user can
 * hold CLIENT on one project and TEAM_LEADER/ENGINEER on another (multi-role
 * is genuinely supported, not an edge case to collapse away), so nav needs
 * "does this user have an internal role ANYWHERE" and "a client role
 * ANYWHERE" as independent signals rather than one collapsed role.
 */
export async function getUserRoleProfile(userId: string): Promise<{ hasInternalRole: boolean; hasClientRole: boolean }> {
  const scoped = await prisma.userRole.findMany({
    where: { userId, projectId: { not: null }, role: { in: PROJECT_SCOPED_ROLES } },
    select: { role: true },
  });
  return {
    hasInternalRole: scoped.some((r) => r.role === "TEAM_LEADER" || r.role === "ENGINEER"),
    hasClientRole: scoped.some((r) => r.role === "CLIENT"),
  };
}

/**
 * Returns the single most-privileged role of a user in a given project, or null
 * — for call sites that only need "is this user at least an X" (see ROLE_PRIORITY).
 * Use getUserProjectRoles() instead where the full set of roles matters.
 * INSPECTOR is a global role (project_id NULL in user_roles) and applies to every project.
 */
export async function getUserProjectRole(
  userId: string,
  projectId: string
): Promise<Role | null> {
  const roles = await getUserProjectRoles(userId, projectId);
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return roles.includes("INSPECTOR") ? "INSPECTOR" : null;
}

/**
 * Returns all project IDs where user has one of the specified roles.
 * If INSPECTOR is requested and the user holds the global INSPECTOR role, every project ID is returned.
 */
export async function getUserProjectIds(
  userId: string,
  roles: Role[]
): Promise<string[]> {
  if (roles.includes("INSPECTOR")) {
    const globalInspector = await prisma.userRole.findFirst({
      where: { userId, projectId: null, role: "INSPECTOR" },
    });
    if (globalInspector) {
      const all = await prisma.project.findMany({ select: { id: true } });
      return all.map((p) => p.id);
    }
  }

  const scopedRoles = roles.filter((r) => r !== "INSPECTOR");
  if (scopedRoles.length === 0) return [];

  const rows = await prisma.userRole.findMany({
    where: { userId, projectId: { not: null }, role: { in: scopedRoles } },
    select: { projectId: true },
  });
  return rows.map((m) => m.projectId!);
}

/**
 * Maps every project the user holds a scoped role on to their single most-
 * privileged role there (see ROLE_PRIORITY). Used where visibility/authorization
 * must be resolved per-project across a result set that spans multiple projects
 * (mis. searchDocuments) — a user who is ENGINEER on project A but only CLIENT
 * on project B must not have project B's internal documents leak through just
 * because they hold an elevated role somewhere else.
 */
export async function getUserRoleMap(userId: string): Promise<Map<string, Role>> {
  const rows = await prisma.userRole.findMany({
    where: { userId, projectId: { not: null }, role: { in: PROJECT_SCOPED_ROLES } },
    select: { projectId: true, role: true },
  });
  const map = new Map<string, Role>();
  for (const row of rows) {
    const pid = row.projectId!;
    const current = map.get(pid);
    if (!current || ROLE_PRIORITY.indexOf(row.role) < ROLE_PRIORITY.indexOf(current)) {
      map.set(pid, row.role);
    }
  }
  return map;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function serialize(data: unknown) {
  return JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v));
}

// no-store on every API response — this app has no cacheable/public data (every
// route is session-scoped), and without it a document's detail page could keep
// showing a just-superseded version (or any other just-changed state) until a
// hard refresh, since the browser has no reason to know a plain GET went stale.
const NO_STORE = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export function ok(data: unknown) {
  return new NextResponse(serialize(data), { headers: NO_STORE });
}

export function created(data: unknown) {
  return new NextResponse(serialize(data), { status: 201, headers: NO_STORE });
}
