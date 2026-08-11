import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

// Mirrors src/lib/services/document-code.service.ts (see that file for why
// this is duplicated rather than imported).
async function generateDocumentCode(projectId: string, phase: string, typeCode: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const phaseCode: Record<string, string> = {
    INISIASI: "AWL", ASSESSMENT: "ASM", DESIGN: "DES",
    IMPLEMENTASI: "IMP", COMMISSIONING: "CMS", INSPEKSI_BERKALA: "INS",
  };
  const prefix = `${project.projectCode}-${phaseCode[phase]}-${typeCode}-`;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.document.findMany({ where: { documentCode: { startsWith: prefix } }, select: { documentCode: true } });
    const maxSeq = existing.reduce((max, d) => {
      const seq = parseInt(d.documentCode!.slice(prefix.length), 10);
      return Number.isNaN(seq) ? max : Math.max(max, seq);
    }, 0);
    return `${prefix}${(maxSeq + 1).toString().padStart(3, "0")}`;
  }, { isolationLevel: "Serializable" });
}

async function main() {
  console.log("🌱 Adding extra sample data to existing project...");

  const project = await prisma.project.findFirstOrThrow({
    where: { name: "LPS Gedung Mewah Tower A" },
  });
  const budi = await prisma.user.findUniqueOrThrow({ where: { email: "budi.leader@lps-edms.com" } });
  const rina = await prisma.user.findUniqueOrThrow({ where: { email: "rina.engineer@lps-edms.com" } });

  const implementasiPhase = await prisma.projectPhase.update({
    where: { projectId_phase: { projectId: project.id, phase: "IMPLEMENTASI" } },
    data: { isActive: true },
  });
  console.log("✓ IMPLEMENTASI phase activated");

  // ─── Laporan Harian (daily progress uploads) ───────────────────────────────
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const dailyReports = [
    { title: "Laporan Harian - Pemasangan Air Terminal Rooftop", daysAgo: 4 },
    { title: "Laporan Harian - Instalasi Down Conductor Lt. 15-20", daysAgo: 3 },
    { title: "Laporan Harian - Instalasi Down Conductor Lt. 10-14", daysAgo: 2 },
    { title: "Laporan Harian - Pemasangan Grounding Electrode", daysAgo: 1 },
  ];
  for (const report of dailyReports) {
    const existing = await prisma.document.findFirst({ where: { title: report.title, projectPhaseId: implementasiPhase.id } });
    if (existing) continue;
    const lhrType = await prisma.documentTypeMaster.findUniqueOrThrow({ where: { typeCode: "LHR" } });
    const documentCode = await generateDocumentCode(project.id, "IMPLEMENTASI", "LHR");
    const doc = await prisma.document.create({
      data: {
        projectId:      project.id,
        projectPhaseId: implementasiPhase.id,
        documentType:   "FILE_UPLOAD",
        documentTypeId: lhrType.id,
        documentCode,
        title:          report.title,
        visibility:     "INTERNAL",
        status:         "APPROVED",
        uploadedById:   rina.id,
        reviewedById:   budi.id,
        reviewedAt:     daysAgo(report.daysAgo),
        createdAt:      daysAgo(report.daysAgo),
      },
    });
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        isCurrent: true,
        createdById: rina.id,
        createdAt: daysAgo(report.daysAgo),
      },
    });
  }
  console.log(`✓ ${dailyReports.length} laporan harian seeded`);

  // ─── Notulen Rapat (meeting minutes) + Action Items ────────────────────────
  const kickoffExists = await prisma.notulen.findFirst({ where: { projectId: project.id, title: "Kick-off Meeting Proyek LPS Tower A" } });
  if (!kickoffExists) {
    const kickoffNotulen = await prisma.notulen.create({
      data: {
        projectId:   project.id,
        title:       "Kick-off Meeting Proyek LPS Tower A",
        meetingDate: new Date("2026-01-16"),
        location:    "Kantor PT Gedung Mewah Properti",
        attendees:   "Budi Santoso, Rina Wulandari, Ahmad Yani",
        discussion:  "Pembahasan jadwal proyek, ruang lingkup pekerjaan, dan penanggung jawab tiap fase.",
        createdById: budi.id,
      },
    });
    await prisma.actionItem.createMany({
      data: [
        {
          notulenId:    kickoffNotulen.id,
          description:  "Siapkan dokumen kontrak & SPK",
          assignedToId: budi.id,
          deadline:     new Date("2026-01-20"),
          status:       "CLOSED",
          closedAt:     new Date("2026-01-20"),
          closedNote:   "Kontrak sudah diupload dan disetujui.",
        },
        {
          notulenId:    kickoffNotulen.id,
          description:  "Mulai survey lokasi & assessment risiko sambaran petir",
          assignedToId: rina.id,
          deadline:     new Date("2026-02-10"),
          status:       "CLOSED",
          closedAt:     new Date("2026-02-10"),
          closedNote:   "Laporan assessment risiko sudah disetujui.",
        },
      ],
    });
  }

  const reviewExists = await prisma.notulen.findFirst({ where: { projectId: project.id, title: "Review Desain LPS Tower A" } });
  if (!reviewExists) {
    const designReviewNotulen = await prisma.notulen.create({
      data: {
        projectId:   project.id,
        title:       "Review Desain LPS Tower A",
        meetingDate: daysAgo(6),
        location:    "Meeting Online (Google Meet)",
        attendees:   "Budi Santoso, Rina Wulandari, Dhani Pratama",
        discussion:  "Review draft desain LPS, perhitungan rolling sphere, dan grounding layout sebelum submit ke klien.",
        createdById: budi.id,
      },
    });
    await prisma.actionItem.createMany({
      data: [
        {
          notulenId:    designReviewNotulen.id,
          description:  "Revisi perhitungan rolling sphere sesuai catatan review",
          assignedToId: rina.id,
          deadline:     daysAgo(-2),
          status:       "OPEN",
        },
        {
          notulenId:    designReviewNotulen.id,
          description:  "Upload grounding layout final",
          assignedToId: rina.id,
          deadline:     daysAgo(-5),
          status:       "OPEN",
        },
      ],
    });
  }
  console.log("✓ notulen rapat with action items seeded");

  await prisma.auditLog.createMany({
    data: [
      { actorId: budi.id, action: "PHASE_CHANGE", entity: "project_phase", projectId: project.id, detail: { phase: "IMPLEMENTASI", isActive: true } },
    ],
  });

  console.log("✅ Extra sample data added.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
