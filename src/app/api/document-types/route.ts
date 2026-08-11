import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { listPhaseRequiredDocuments } from "@/lib/services/project.service";
import type { LpsPhase } from "@prisma/client";

/** GET /api/document-types — returns PhaseRequiredDocument config (seeded) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const phase = searchParams.get("phase") as LpsPhase | null;

  const types = await listPhaseRequiredDocuments(phase);

  return ok(types);
}
