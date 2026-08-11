import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

const DOCUMENT_TYPES = [
  { typeCode: "KTR", name: "Kontrak / SPK", retentionPeriodYears: 10, retentionTrigger: "PROJECT_COMPLETION" },
  { typeCode: "RSK", name: "Laporan Assessment Risiko", retentionPeriodYears: 10, retentionTrigger: "PROJECT_COMPLETION" },
  { typeCode: "DES", name: "Dokumen Desain LPS", retentionPeriodYears: 10, retentionTrigger: "PROJECT_COMPLETION" },
  { typeCode: "RSF", name: "Perhitungan Rolling Sphere", retentionPeriodYears: 10, retentionTrigger: "PROJECT_COMPLETION" },
  { typeCode: "GRD", name: "Grounding Layout", retentionPeriodYears: 10, retentionTrigger: "PROJECT_COMPLETION" },
  { typeCode: "LHR", name: "Laporan Harian / Progress", retentionPeriodYears: 5, retentionTrigger: "PROJECT_COMPLETION" },
  { typeCode: "ABD", name: "Gambar As-Built", retentionPeriodYears: null, retentionTrigger: "SYSTEM_END_OF_LIFE" },
  { typeCode: "LOG", name: "Log Pengujian Commissioning", retentionPeriodYears: null, retentionTrigger: "SYSTEM_END_OF_LIFE" },
  { typeCode: "CHK", name: "Checklist Verifikasi", retentionPeriodYears: null, retentionTrigger: "SYSTEM_END_OF_LIFE" },
  { typeCode: "LIB", name: "Laporan Inspeksi Berkala", retentionPeriodYears: null, retentionTrigger: "SYSTEM_END_OF_LIFE" },
  { typeCode: "SLO", name: "Sertifikat Laik Operasi", retentionPeriodYears: null, retentionTrigger: "SYSTEM_END_OF_LIFE" },
  { typeCode: "FOT", name: "Foto Dokumentasi", retentionPeriodYears: 5, retentionTrigger: "PROJECT_COMPLETION" },
  { typeCode: "DOC", name: "Dokumen Umum / Lainnya", retentionPeriodYears: null, retentionTrigger: null },
] as const;

/** Maps a PhaseRequiredDocument's config label to the new type_code. */
const LABEL_TO_CODE: Record<string, string> = {
  "Kontrak / SPK": "KTR",
  "Laporan Assessment Risiko": "RSK",
  "Dokumen Desain LPS": "DES",
  "Perhitungan Rolling Sphere": "RSF",
  "Grounding Layout": "GRD",
  "Laporan Harian / Progress": "LHR",
  "As-Built Drawing": "ABD",
  "Log Pengujian Commissioning": "LOG",
  "Checklist Verifikasi": "CHK",
  "Laporan Inspeksi Berkala": "LIB",
};

/** Maps an existing Document to a type_code using its old enum value first, then title heuristics, falling back to DOC. */
function inferDocumentTypeCode(doc: { documentType: string; title: string }): string {
  if (doc.documentType === "LAPORAN_ASSESSMENT_RISIKO") return "RSK";
  if (doc.documentType === "LOG_COMMISSIONING") return "LOG";
  if (doc.documentType === "LAPORAN_INSPEKSI_BERKALA") return "LIB";

  const title = doc.title.toLowerCase();
  // Check "laporan harian" before generic phase-keyword substrings (e.g. a daily
  // report titled "...Pemasangan Grounding Electrode" must stay LHR, not GRD).
  if (title.includes("laporan harian")) return "LHR";
  if (title.includes("kontrak")) return "KTR";
  if (title.includes("dokumen desain") || title.includes("desain lps")) return "DES";
  if (title.includes("rolling sphere")) return "RSF";
  if (title.includes("grounding")) return "GRD";
  if (title.includes("as-built") || title.includes("as built")) return "ABD";
  if (title.includes("checklist")) return "CHK";
  if (title.includes("sertifikat")) return "SLO";
  if (title.includes("foto")) return "FOT";
  return "DOC";
}

async function main() {
  console.log("Seeding document_types (13 rows)...");
  const codeToId: Record<string, string> = {};
  for (const t of DOCUMENT_TYPES) {
    const existing = await prisma.documentTypeMaster.findFirst({ where: { typeCode: t.typeCode } });
    const row = existing ?? await prisma.documentTypeMaster.create({ data: t });
    codeToId[t.typeCode] = row.id;
  }
  console.log(`✓ ${DOCUMENT_TYPES.length} document types ready`);

  // ─── Dedupe phase_required_documents (leftover from an earlier partial seed run) ───
  const allRequired = await prisma.phaseRequiredDocument.findMany({ orderBy: { id: "asc" } });
  const seen = new Set<string>();
  let deduped = 0;
  for (const r of allRequired) {
    const key = `${r.phase}::${r.label}`;
    if (seen.has(key)) {
      await prisma.phaseRequiredDocument.delete({ where: { id: r.id } });
      deduped++;
    } else {
      seen.add(key);
    }
  }
  console.log(`✓ ${deduped} duplicate phase_required_documents row(s) removed`);

  // ─── Backfill phase_required_documents.document_type_id ───
  const remainingRequired = await prisma.phaseRequiredDocument.findMany();
  let requiredMapped = 0;
  for (const r of remainingRequired) {
    const code = LABEL_TO_CODE[r.label];
    if (!code) { console.log(`  ⚠ no mapping for label "${r.label}", left as NULL`); continue; }
    await prisma.phaseRequiredDocument.update({ where: { id: r.id }, data: { documentTypeId: codeToId[code] } });
    requiredMapped++;
  }
  console.log(`✓ ${requiredMapped} phase_required_documents mapped to a document type`);

  // ─── Backfill documents.document_type_id + documents.project_id ───
  const documents = await prisma.document.findMany({ include: { projectPhase: { select: { projectId: true } } } });
  const codeCounts: Record<string, number> = {};
  for (const doc of documents) {
    const code = inferDocumentTypeCode(doc);
    codeCounts[code] = (codeCounts[code] ?? 0) + 1;
    await prisma.document.update({
      where: { id: doc.id },
      data: { documentTypeId: codeToId[code], projectId: doc.projectPhase.projectId },
    });
  }
  console.log(`✓ ${documents.length} documents mapped:`, codeCounts);

  const stillNull = await prisma.document.count({ where: { documentTypeId: null } });
  console.log(stillNull === 0 ? "✅ All documents have a document_type_id." : `⚠ ${stillNull} documents still missing document_type_id`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
