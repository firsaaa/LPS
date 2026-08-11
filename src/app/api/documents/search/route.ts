import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { advancedSearchDocuments } from "@/lib/services/document.service";
import type { DocumentStatus } from "@prisma/client";

/**
 * GET /api/documents/search — combinable filters:
 * keyword (title+code+tag+file content), project_id, phase,
 * document_type_id, date_from, date_to, due_date_from, due_date_to, document_code,
 * status, uploader (name, partial match), tags (repeatable).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const results = await advancedSearchDocuments(user, {
    keyword: searchParams.get("keyword") ?? undefined,
    projectId: searchParams.get("project_id") ?? undefined,
    phase: searchParams.get("phase") ?? undefined,
    documentTypeId: searchParams.get("document_type_id") ?? undefined,
    dateFrom: searchParams.get("date_from") ?? undefined,
    dateTo: searchParams.get("date_to") ?? undefined,
    dueDateFrom: searchParams.get("due_date_from") ?? undefined,
    dueDateTo: searchParams.get("due_date_to") ?? undefined,
    documentCode: searchParams.get("document_code") ?? undefined,
    status: (searchParams.get("status") as DocumentStatus) ?? undefined,
    uploaderName: searchParams.get("uploader") ?? undefined,
    tags: searchParams.getAll("tags"),
  });

  return ok({ count: results.length, results });
}
