import { prisma } from "@/lib/prisma";

/**
 * Lightweight "things needing your attention" count for the notification bell —
 * documents assigned to you that aren't approved yet, plus open action items
 * assigned to you. No joins beyond the two counts themselves.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [assignedDocs, openActionItems] = await Promise.all([
    prisma.document.count({ where: { assignedToId: userId, status: { notIn: ["APPROVED", "ARCHIVED"] } } }),
    prisma.actionItem.count({ where: { assignedToId: userId, status: "OPEN" } }),
  ]);
  return assignedDocs + openActionItems;
}
