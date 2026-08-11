import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { GlobalRole } from "@/types";

const userSelect = {
  id: true,
  name: true,
  email: true,
  canLeadProject: true,
  isActive: true,
  createdAt: true,
  roles: { where: { projectId: null }, select: { role: true } },
};

/** Collapses a user's global-scope UserRole rows into a single display value (SUPERADMIN takes precedence). */
function withGlobalRole<T extends { roles: { role: string }[] }>(user: T) {
  const { roles, ...rest } = user;
  const globalRole: GlobalRole | null = roles.some((r) => r.role === "SUPERADMIN")
    ? "SUPERADMIN"
    : roles.some((r) => r.role === "INSPECTOR")
    ? "INSPECTOR"
    : null;
  return { ...rest, globalRole };
}

async function setGlobalRole(userId: string, globalRole: GlobalRole | null | undefined) {
  if (globalRole === undefined) return;
  await prisma.userRole.deleteMany({ where: { userId, projectId: null, role: { in: ["SUPERADMIN", "INSPECTOR"] } } });
  if (globalRole) {
    await prisma.userRole.create({ data: { userId, projectId: null, role: globalRole } });
  }
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: userSelect });
  return users.map(withGlobalRole);
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  globalRole?: GlobalRole | null;
  canLeadProject?: boolean;
}): Promise<{ error: string } | { user: NonNullable<Awaited<ReturnType<typeof getUserById>>> }> {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { error: "Email sudah terdaftar" };

  const passwordHash = await bcrypt.hash(data.password, 12);

  const newUser = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      canLeadProject: data.canLeadProject ?? false,
    },
  });

  await setGlobalRole(newUser.id, data.globalRole ?? null);

  const full = await getUserById(newUser.id);
  return { user: full! };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  return user ? withGlobalRole(user) : null;
}

export async function updateUser(id: string, data: {
  name?: string;
  isActive?: boolean;
  globalRole?: GlobalRole | null;
  canLeadProject?: boolean;
}) {
  const found = await prisma.user.findUnique({ where: { id } });
  if (!found) return { error: "not_found" as const };

  await prisma.user.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.canLeadProject !== undefined && { canLeadProject: data.canLeadProject }),
    },
  });

  await setGlobalRole(id, data.globalRole);

  return { success: true as const };
}

export async function deactivateUser(id: string) {
  await prisma.user.update({ where: { id }, data: { isActive: false } });
}
