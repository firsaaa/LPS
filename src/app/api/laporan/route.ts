import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { getLaporanReport } from "@/lib/services/dashboard.service";

/** GET /api/laporan?projectId=xxx&period=week|month|all */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const period = (searchParams.get("period") ?? "week") as "today" | "week" | "month" | "all";

  const result = await getLaporanReport(user, projectId, period);

  return ok(result);
}
