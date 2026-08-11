import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { getProjectDashboard } from "@/lib/services/dashboard.service";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const result = await getProjectDashboard(user, projectId);

  return ok(result);
}
