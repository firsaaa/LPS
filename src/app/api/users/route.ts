import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, forbidden, ok, created, badRequest } from "@/lib/api-helpers";
import { listUsers, createUser } from "@/lib/services/user.service";
import type { GlobalRole } from "@/types";

// Any authenticated user can list the roster — a Team Leader needs it to pick
// who to add to their project's team (see "Tambah Anggota"). listUsers()
// only ever selects name/email/canLeadProject/isActive/global role, nothing
// sensitive. Creating/editing users (POST below) stays Superadmin-only.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const users = await listUsers();

  return ok(users);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.isSuperadmin) return forbidden();

  const body = await req.json();
  const { name, email, password, globalRole, canLeadProject } = body as {
    name: string;
    email: string;
    password: string;
    globalRole?: GlobalRole;
    canLeadProject?: boolean;
  };

  if (!name || !email || !password) return badRequest("name, email, password wajib diisi");

  const result = await createUser({ name, email, password, globalRole, canLeadProject });
  if ("error" in result) return badRequest(result.error);

  return created(result.user);
}
