import { prisma } from "@/lib/prisma";

export function listTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

export function listDocumentTags(documentId: string) {
  return prisma.documentTag.findMany({ where: { documentId }, include: { tag: true } });
}

// Tags dapat diisi bebas sesuai kebutuhan pengguna — dibuat otomatis (upsert)
// kalau namanya belum pernah ada, bukan dibatasi ke daftar tetap.
export async function attachTag(
  documentId: string,
  rawName: string,
  actorId: string
): Promise<{ error: string } | { documentTag: Awaited<ReturnType<typeof listDocumentTags>>[number] }> {
  const name = rawName.trim().toLowerCase();
  if (!name) return { error: "Nama tag wajib diisi" };

  const tag = await prisma.tag.upsert({ where: { name }, create: { name }, update: {} });

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
