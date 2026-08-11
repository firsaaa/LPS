import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { listTags } from "@/lib/services/tag.service";

/** GET /api/tags — tag list for autocomplete. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const tags = await listTags();
  return ok(tags);
}
