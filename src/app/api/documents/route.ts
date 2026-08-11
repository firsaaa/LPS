import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { searchDocuments } from "@/lib/services/document.service";
import type { DocumentType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const projectId = searchParams.get("projectId");
  const phase = searchParams.get("phase");
  const statusFilter = searchParams.get("status");
  const documentType = searchParams.get("documentType") as DocumentType | null;

  const documents = await searchDocuments(user, { q, projectId, phase, status: statusFilter, documentType });

  return ok(documents);
}
