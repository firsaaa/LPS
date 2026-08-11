import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { getMyTasks } from "@/lib/services/dashboard.service";

/** GET /api/me/tasks — dokumen yang di-assign ke saya + action item open yang jadi tanggung jawab saya */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const result = await getMyTasks(user.id);

  return ok(result);
}
