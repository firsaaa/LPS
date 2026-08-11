import { prisma } from "@/lib/prisma";

export function listTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

export function listDocumentTags(documentId: string) {
  return prisma.documentTag.findMany({ where: { documentId }, include: { tag: true } });
}

// Tags are picked from the existing, fixed list only (not created on the fly)
// so every tag keeps one consistent meaning (a document's type category).
export async function attachTag(
  documentId: string,
  rawName: string,
  actorId: string
): Promise<{ error: string } | { documentTag: Awaited<ReturnType<typeof listDocumentTags>>[number] }> {
  const name = rawName.trim().toLowerCase();
  if (!name) return { error: "Nama tag wajib diisi" };

  const tag = await prisma.tag.findUnique({ where: { name } });
  if (!tag) return { error: `Tag "${name}" belum terdaftar — pilih dari daftar tag yang tersedia` };

  const existing = await prisma.documentTag.findUnique({
    where: { documentId_tagId: { documentId, tagId: tag.id } },
  });
  if (existing) return { error: "Tag sudah dilekatkan pada dokumen ini" };

  const documentTag = await prisma.documentTag.create({
    data: { documentId, tagId: tag.id, assignedById: actorId },
    include: { tag: true },
  });

  return { documentTag };
}

export async function detachTag(documentId: string, tagId: string): Promise<{ error: string } | { success: true }> {
  const existing = await prisma.documentTag.findUnique({
    where: { documentId_tagId: { documentId, tagId } },
  });
  if (!existing) return { error: "not_found" };

  await prisma.documentTag.delete({ where: { documentId_tagId: { documentId, tagId } } });
  return { success: true };
}
