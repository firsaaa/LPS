import { getSessionUser, unauthorized, ok } from "@/lib/api-helpers";
import { getUnreadNotificationCount } from "@/lib/services/notification.service";

/** GET /api/notifications/unread-count — polled every 30s by the client (NFR-06). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const count = await getUnreadNotificationCount(user.id);
  return ok({ count });
}
