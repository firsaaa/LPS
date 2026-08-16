import { prisma } from "@/lib/prisma";
import { LPS_PHASES } from "@/types";

const referenceDocSelect = {
  id: true,
  title: true,
  documentCode: true,
  status: true,
  projectPhase: { select: { phase: true } },
} as const;

export function listDocumentReferences(documentId: string) {
  return Promise.all([
    prisma.documentReference.findMany({
      where: { documentId },
      include: { referencedDocument: { select: referenceDocSelect }, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.documentReference.findMany({
      where: { referencedDocumentId: documentId },
      include: { document: { select: referenceDocSelect }, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]).then(([references, referencedBy]) => ({ references, referencedBy }));
}

// documentId "menyatakan berdasarkan" referencedDocumentId (mis. Desain LPS
// BASED_ON Laporan Assessment Risiko). Dibatasi ke dokumen dalam proyek yang
// sama — menautkan dokumen lintas proyek tidak masuk akal untuk keperluan
// penelusuran siklus dokumen ini.
export async function addDocumentReference(params: {
  documentId: string;
  referencedDocumentId: string;
  actorId: string;
}): Promise<{ error: string } | { reference: Awaited<ReturnType<typeof listDocumentReferences>>["references"][number] }> {
  if (params.documentId === params.referencedDocumentId) {
    return { error: "self_reference" };
  }

  const [doc, referencedDoc] = await Promise.all([
    prisma.document.findUnique({ where: { id: params.documentId }, select: { projectId: true } }),
    prisma.document.findUnique({ where: { id: params.referencedDocumentId }, select: { projectId: true } }),
  ]);
  if (!doc || !referencedDoc) return { error: "not_found" };
  if (doc.projectId !== referencedDoc.projectId) return { error: "different_project" };

  const existing = await prisma.documentReference.findUnique({
    where: {
      documentId_referencedDocumentId_relationType: {
        documentId: params.documentId,
        referencedDocumentId: params.referencedDocumentId,
        relationType: "BASED_ON",
      },
    },
  });
  if (existing) return { error: "already_linked" };

  const reference = await prisma.$transaction(async (tx) => {
    const created = await tx.documentReference.create({
      data: {
        documentId: params.documentId,
        referencedDocumentId: params.referencedDocumentId,
        relationType: "BASED_ON",
        createdById: params.actorId,
      },
      include: { referencedDocument: { select: referenceDocSelect }, createdBy: { select: { id: true, name: true } } },
    });
    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        action: "LINK",
        entity: "document",
        entityId: params.documentId,
        projectId: doc.projectId,
        detail: { referencedDocumentId: params.referencedDocumentId, relationType: "BASED_ON" },
      },
    });
    return created;
  });

  return { reference };
}

export async function removeDocumentReference(
  referenceId: string,
  actorId: string
): Promise<{ error: string } | { success: true }> {
  const existing = await prisma.documentReference.findUnique({ where: { id: referenceId } });
  if (!existing) return { error: "not_found" };

  await prisma.$transaction([
    prisma.documentReference.delete({ where: { id: referenceId } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "UNLINK",
        entity: "document",
        entityId: existing.documentId,
        detail: { referencedDocumentId: existing.referencedDocumentId, relationType: existing.relationType },
      },
    }),
  ]);

  return { success: true };
}

// M-1 Traceability Coverage — % dokumen (bukan DRAFT — dokumen draft belum
// jadi bagian resmi riwayat proyek, lihat deleteOrArchiveDocument()) yang
// punya minimal satu referensi, keluar (based-on dokumen lain) atau masuk
// (dijadikan dasar dokumen lain).
//
// M-2 Lifecycle Integration Level — dari pasangan fase yang bersebelahan pada
// urutan resmi (LPS_PHASES) dan sama-sama sudah punya dokumen, berapa persen
// pasangan itu punya minimal satu referensi yang menautkan dokumen di kedua
// fase tersebut. Dua definisi ini adalah interpretasi wajar dari nama
// metriknya (belum dicocokkan ke rumus persis di naskah skripsi — perlu
// diverifikasi manual oleh penulis terhadap Bab III/VI).
export async function getTraceabilityMetrics(projectId: string) {
  const documents = await prisma.document.findMany({
    where: { projectId, status: { not: "DRAFT" } },
    select: { id: true, projectPhase: { select: { phase: true } } },
  });

  const references = await prisma.documentReference.findMany({
    where: { document: { projectId } },
    select: {
      documentId: true,
      referencedDocumentId: true,
      document: { select: { projectPhase: { select: { phase: true } } } },
      referencedDocument: { select: { projectPhase: { select: { phase: true } } } },
    },
  });

  const linkedDocIds = new Set<string>();
  for (const r of references) {
    linkedDocIds.add(r.documentId);
    linkedDocIds.add(r.referencedDocumentId);
  }
  const coveredCount = documents.filter((d) => linkedDocIds.has(d.id)).length;
  const traceabilityCoverage = documents.length === 0 ? 0 : Math.round((coveredCount / documents.length) * 100);

  const phaseOrder = LPS_PHASES.map((p) => p.phase);
  const phasesWithDocs = new Set(documents.map((d) => d.projectPhase.phase));
  const adjacentPairs: [string, string][] = [];
  for (let i = 0; i < phaseOrder.length - 1; i++) {
    const a = phaseOrder[i], b = phaseOrder[i + 1];
    if (phasesWithDocs.has(a) && phasesWithDocs.has(b)) adjacentPairs.push([a, b]);
  }
  const linkedPairs = adjacentPairs.filter(([a, b]) =>
    references.some((r) => {
      const fromPhase = r.document.projectPhase.phase;
      const toPhase = r.referencedDocument.projectPhase.phase;
      return (fromPhase === a && toPhase === b) || (fromPhase === b && toPhase === a);
    })
  );
  const lifecycleIntegrationLevel =
    adjacentPairs.length === 0 ? 0 : Math.round((linkedPairs.length / adjacentPairs.length) * 100);

  return {
    traceabilityCoverage,
    documentsTotal: documents.length,
    documentsCovered: coveredCount,
    lifecycleIntegrationLevel,
    adjacentPhasePairsTotal: adjacentPairs.length,
    adjacentPhasePairsLinked: linkedPairs.length,
    totalReferences: references.length,
  };
}
