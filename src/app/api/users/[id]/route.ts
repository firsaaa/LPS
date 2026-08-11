import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, forbidden, ok, badRequest, notFound } from "@/lib/api-helpers";
import { getUserById, updateUser, deactivateUser } from "@/lib/services/user.service";
import type { GlobalRole } from "@/types";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.isSuperadmin) return forbidden();

  const { id } = await params;
  const found = await getUserById(id);
  if (!found) return notFound("User tidak ditemukan");

  return ok(found);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.isSuperadmin) return forbidden();

  const { id } = await params;
  const body = await req.json();
  const { name, isActive, globalRole, canLeadProject } = body as {
    name?: string;
    isActive?: boolean;
    globalRole?: GlobalRole | null;
    canLeadProject?: boolean;
  };

  const result = await updateUser(id, { name, isActive, globalRole, canLeadProject });
  if ("error" in result) return notFound("User tidak ditemukan");

  return ok({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.isSuperadmin) return forbidden();

  const { id } = await params;
  if (id === user.id) return badRequest("Tidak dapat menonaktifkan akun sendiri");

  await deactivateUser(id);
  return ok({ success: true });
}
