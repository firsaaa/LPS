import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { listDocumentTypeMasters } from "@/lib/services/document.service";

/** GET /api/document-type-master — the 13-type master list, for search/upload dropdowns. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const types = await listDocumentTypeMasters();
  return ok(types);
}
