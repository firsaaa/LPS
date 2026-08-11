import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

// ─── Minimal valid PDF ────────────────────────────────────────────────────────
function makePdf(title: string): Buffer {
  const safe = title.replace(/[()\\]/g, "");
  const body = `BT /F1 13 Tf 50 750 Td (${safe}) Tj 0 -20 Td (LPS EDMS - Dokumen Demo) Tj ET`;
  const objs = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`,
    `4 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) { offsets.push(pdf.length); pdf += o + "\n"; }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += o.toString().padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function writeFile(dir: string, name: string, title: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, makePdf(title));
  return `uploads/${path.basename(dir)}/${name}`;
}

async function createDoc(
  prisma: any,
  phaseId: string,
  uploadedById: string,
  reviewedById: string | null,
  opts: {
    documentType: string;
    title: string;
    status: string;
    visibility?: string;
    filePath: string;
    versionNumber?: number;
    reviewedAt?: Date;
  }
) {
  const doc = await prisma.document.create({
    data: {
      projectPhaseId: phaseId,
      documentType: opts.documentType,
      title: opts.title,
      status: opts.status,
      visibility: opts.visibility ?? "INTERNAL",
      uploadedById,
      reviewedById: opts.status === "APPROVED" ? reviewedById : null,
      reviewedAt: opts.reviewedAt ?? (opts.status === "APPROVED" ? new Date() : null),
    },
  });
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      versionNumber: opts.versionNumber ?? 1,
      isCurrent: true,
      filePath: opts.filePath,
      createdById: uploadedById,
    },
  });
  return doc;
}

async function main() {
  console.log("🌱 Adding demo projects...\n");

  const exists = await prisma.project.findFirst({ where: { name: "Mall Bintang Utara" } });
  if (exists) { console.log("Demo projects already exist, skipping."); return; }

  const budi    = await prisma.user.findUniqueOrThrow({ where: { email: "budi.leader@lps-edms.com" } });
  const rina    = await prisma.user.findUniqueOrThrow({ where: { email: "rina.engineer@lps-edms.com" } });
  const dhani   = await prisma.user.findUniqueOrThrow({ where: { email: "dhani.inspector@lps-edms.com" } });
  const client  = await prisma.user.findUniqueOrThrow({ where: { email: "client@gedungmewah.com" } });

  // ─── Project 1: Apartemen Skyline — SELESAI (semua 6 fase lengkap) ──────────
  {
    const p = await prisma.project.create({
      data: {
        name: "Apartemen Skyline Jakarta",
        description: "Sistem proteksi petir untuk apartemen 32 lantai di Jakarta Selatan.",
        client: "PT Skyline Realty Indonesia",
        location: "Jakarta Selatan",
        status: "COMPLETED",
        startDate: new Date("2025-03-01"),
        targetEndDate: new Date("2025-12-15"),
        createdById: budi.id,
      },
    });
    await prisma.projectMember.createMany({ data: [
      { userId: budi.id,   projectId: p.id, projectRole: "TEAM_LEADER" },
      { userId: rina.id,   projectId: p.id, projectRole: "ENGINEER"    },
      { userId: dhani.id,  projectId: p.id, projectRole: "INSPECTOR"   },
      { userId: client.id, projectId: p.id, projectRole: "CLIENT"      },
    ]});

    const ups = path.join(process.cwd(), "uploads", p.id);
    const phases = await prisma.projectPhase.createManyAndReturn({ data: [
      { projectId: p.id, phase: "INISIASI",         isActive: true  },
      { projectId: p.id, phase: "ASSESSMENT",       isActive: true  },
      { projectId: p.id, phase: "DESIGN",           isActive: true  },
      { projectId: p.id, phase: "IMPLEMENTASI",     isActive: true  },
      { projectId: p.id, phase: "COMMISSIONING",    isActive: true  },
      { projectId: p.id, phase: "INSPEKSI_BERKALA", isActive: true  },
    ]});
    const ph = (phase: string) => phases.find((x: any) => x.phase === phase)!;

    // INISIASI
    await createDoc(prisma, ph("INISIASI").id, budi.id, budi.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED", visibility: "CLIENT_ACCESSIBLE",
      title: "Kontrak LPS Apartemen Skyline",
      filePath: writeFile(ups, "kontrak-skyline.pdf", "Kontrak LPS Apartemen Skyline"),
      reviewedAt: new Date("2025-03-10"),
    });

    // ASSESSMENT
    await createDoc(prisma, ph("ASSESSMENT").id, rina.id, dhani.id, {
      documentType: "LAPORAN_ASSESSMENT_RISIKO", status: "APPROVED",
      title: "Laporan Assessment Risiko LPS Apartemen Skyline",
      filePath: writeFile(ups, "assessment-skyline.pdf", "Laporan Assessment Risiko - Skyline"),
      reviewedAt: new Date("2025-04-05"),
    });

    // DESIGN — 3 dokumen wajib
    await createDoc(prisma, ph("DESIGN").id, rina.id, dhani.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Dokumen Desain LPS Skyline",
      filePath: writeFile(ups, "desain-lps-skyline.pdf", "Dokumen Desain LPS Skyline"),
      reviewedAt: new Date("2025-05-10"),
    });
    await createDoc(prisma, ph("DESIGN").id, rina.id, dhani.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Perhitungan Rolling Sphere Skyline",
      filePath: writeFile(ups, "rolling-sphere-skyline.pdf", "Perhitungan Rolling Sphere Skyline"),
      reviewedAt: new Date("2025-05-12"),
    });
    await createDoc(prisma, ph("DESIGN").id, rina.id, dhani.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Grounding Layout Skyline",
      filePath: writeFile(ups, "grounding-skyline.pdf", "Grounding Layout Skyline"),
      reviewedAt: new Date("2025-05-14"),
    });

    // IMPLEMENTASI — 3 laporan harian
    for (let i = 1; i <= 3; i++) {
      await createDoc(prisma, ph("IMPLEMENTASI").id, rina.id, budi.id, {
        documentType: "FILE_UPLOAD", status: "APPROVED",
        title: `Laporan Harian Implementasi Skyline - Minggu ${i}`,
        filePath: writeFile(ups, `laporan-harian-skyline-${i}.pdf`, `Laporan Harian Skyline Minggu ${i}`),
        reviewedAt: new Date(`2025-0${6 + i}-0${i}`),
      });
    }

    // COMMISSIONING — 3 dokumen wajib
    await createDoc(prisma, ph("COMMISSIONING").id, dhani.id, budi.id, {
      documentType: "LOG_COMMISSIONING", status: "APPROVED",
      title: "Log Pengujian Commissioning Skyline",
      filePath: writeFile(ups, "log-commissioning-skyline.pdf", "Log Pengujian Commissioning Skyline"),
      reviewedAt: new Date("2025-10-01"),
    });
    await createDoc(prisma, ph("COMMISSIONING").id, rina.id, budi.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "As-Built Drawing LPS Skyline",
      filePath: writeFile(ups, "as-built-skyline.pdf", "As-Built Drawing LPS Skyline"),
      reviewedAt: new Date("2025-10-05"),
    });
    await createDoc(prisma, ph("COMMISSIONING").id, dhani.id, budi.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Checklist Verifikasi Commissioning Skyline",
      filePath: writeFile(ups, "checklist-skyline.pdf", "Checklist Verifikasi Commissioning Skyline"),
      reviewedAt: new Date("2025-10-07"),
    });

    // INSPEKSI BERKALA
    await createDoc(prisma, ph("INSPEKSI_BERKALA").id, dhani.id, budi.id, {
      documentType: "LAPORAN_INSPEKSI_BERKALA", status: "APPROVED",
      title: "Laporan Inspeksi Berkala LPS Skyline - 2025",
      filePath: writeFile(ups, "inspeksi-berkala-skyline.pdf", "Laporan Inspeksi Berkala Skyline 2025"),
      reviewedAt: new Date("2025-12-10"),
    });

    console.log(`✓ Apartemen Skyline Jakarta (SELESAI, 6/6 fase)`);
  }

  // ─── Project 2: Mall Bintang Utara — AKTIF (sampai Commissioning) ──────────
  {
    const p = await prisma.project.create({
      data: {
        name: "Mall Bintang Utara",
        description: "Proteksi petir untuk pusat perbelanjaan 5 lantai di Bekasi.",
        client: "PT Mitra Niaga Sejahtera",
        location: "Bekasi, Jawa Barat",
        status: "ACTIVE",
        startDate: new Date("2026-02-01"),
        targetEndDate: new Date("2026-10-31"),
        createdById: budi.id,
      },
    });
    await prisma.projectMember.createMany({ data: [
      { userId: budi.id,   projectId: p.id, projectRole: "TEAM_LEADER" },
      { userId: rina.id,   projectId: p.id, projectRole: "ENGINEER"    },
      { userId: dhani.id,  projectId: p.id, projectRole: "INSPECTOR"   },
    ]});

    const ups = path.join(process.cwd(), "uploads", p.id);
    const phases = await prisma.projectPhase.createManyAndReturn({ data: [
      { projectId: p.id, phase: "INISIASI",         isActive: true  },
      { projectId: p.id, phase: "ASSESSMENT",       isActive: true  },
      { projectId: p.id, phase: "DESIGN",           isActive: true  },
      { projectId: p.id, phase: "IMPLEMENTASI",     isActive: true  },
      { projectId: p.id, phase: "COMMISSIONING",    isActive: true  },
      { projectId: p.id, phase: "INSPEKSI_BERKALA", isActive: false },
    ]});
    const ph = (phase: string) => phases.find((x: any) => x.phase === phase)!;

    // INISIASI
    await createDoc(prisma, ph("INISIASI").id, budi.id, budi.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED", visibility: "CLIENT_ACCESSIBLE",
      title: "Kontrak LPS Mall Bintang Utara",
      filePath: writeFile(ups, "kontrak-mall.pdf", "Kontrak LPS Mall Bintang Utara"),
      reviewedAt: new Date("2026-02-10"),
    });

    // ASSESSMENT
    await createDoc(prisma, ph("ASSESSMENT").id, rina.id, dhani.id, {
      documentType: "LAPORAN_ASSESSMENT_RISIKO", status: "APPROVED",
      title: "Laporan Assessment Risiko LPS Mall Bintang Utara",
      filePath: writeFile(ups, "assessment-mall.pdf", "Laporan Assessment Risiko Mall Bintang Utara"),
      reviewedAt: new Date("2026-03-05"),
    });

    // DESIGN — semua APPROVED
    await createDoc(prisma, ph("DESIGN").id, rina.id, dhani.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Dokumen Desain LPS Mall Bintang Utara",
      filePath: writeFile(ups, "desain-lps-mall.pdf", "Dokumen Desain LPS Mall Bintang Utara"),
      reviewedAt: new Date("2026-04-10"),
    });
    await createDoc(prisma, ph("DESIGN").id, rina.id, dhani.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Perhitungan Rolling Sphere Mall Bintang Utara",
      filePath: writeFile(ups, "rolling-sphere-mall.pdf", "Perhitungan Rolling Sphere Mall Bintang Utara"),
      reviewedAt: new Date("2026-04-12"),
    });
    await createDoc(prisma, ph("DESIGN").id, rina.id, dhani.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Grounding Layout Mall Bintang Utara",
      filePath: writeFile(ups, "grounding-mall.pdf", "Grounding Layout Mall Bintang Utara"),
      reviewedAt: new Date("2026-04-14"),
    });

    // IMPLEMENTASI — 2 laporan APPROVED, 1 masih DRAFT
    await createDoc(prisma, ph("IMPLEMENTASI").id, rina.id, budi.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Laporan Harian Implementasi Mall - Minggu 1",
      filePath: writeFile(ups, "laporan-harian-mall-1.pdf", "Laporan Harian Mall Bintang Utara Minggu 1"),
      reviewedAt: new Date("2026-05-10"),
    });
    await createDoc(prisma, ph("IMPLEMENTASI").id, rina.id, budi.id, {
      documentType: "FILE_UPLOAD", status: "APPROVED",
      title: "Laporan Harian Implementasi Mall - Minggu 2",
      filePath: writeFile(ups, "laporan-harian-mall-2.pdf", "Laporan Harian Mall Bintang Utara Minggu 2"),
      reviewedAt: new Date("2026-05-17"),
    });
    await createDoc(prisma, ph("IMPLEMENTASI").id, rina.id, null, {
      documentType: "FILE_UPLOAD", status: "DRAFT",
      title: "Laporan Harian Implementasi Mall - Minggu 3",
      filePath: writeFile(ups, "laporan-harian-mall-3.pdf", "Laporan Harian Mall Bintang Utara Minggu 3"),
    });

    // COMMISSIONING — Log sedang direview, 2 lainnya belum ada
    await createDoc(prisma, ph("COMMISSIONING").id, dhani.id, null, {
      documentType: "LOG_COMMISSIONING", status: "UNDER_REVIEW",
      title: "Log Pengujian Commissioning Mall Bintang Utara",
      filePath: writeFile(ups, "log-commissioning-mall.pdf", "Log Pengujian Commissioning Mall Bintang Utara"),
    });

    // Notulen rapat
    const notulen = await prisma.notulen.create({ data: {
      projectId: p.id, createdById: budi.id,
      title: "Rapat Progres Commissioning Mall Bintang Utara",
      meetingDate: new Date("2026-07-10"),
      attendees: "Budi (Leader), Rina (Engineer), Dhani (Inspector)",
      discussion: "Pembahasan progres commissioning dan checklist yang masih belum selesai.",
    }});
    await prisma.actionItem.createMany({ data: [
      { notulenId: notulen.id, assignedToId: rina.id,  description: "Selesaikan As-Built Drawing sebelum 20 Juli", deadline: new Date("2026-07-20"), status: "OPEN" },
      { notulenId: notulen.id, assignedToId: dhani.id, description: "Upload Checklist Verifikasi hasil commissioning",  deadline: new Date("2026-07-18"), status: "OPEN" },
    ]});

    console.log(`✓ Mall Bintang Utara (AKTIF, Commissioning sedang berjalan)`);
  }

  // ─── Project 3: Gedung Pemda — PERENCANAAN (baru inisiasi) ─────────────────
  {
    const p = await prisma.project.create({
      data: {
        name: "Gedung Dinas PU Bandung",
        description: "Sistem proteksi petir gedung kantor pemerintahan 8 lantai.",
        client: "Dinas Pekerjaan Umum Kota Bandung",
        location: "Bandung, Jawa Barat",
        status: "PLANNING",
        startDate: new Date("2026-07-01"),
        targetEndDate: new Date("2027-02-28"),
        createdById: budi.id,
      },
    });
    await prisma.projectMember.createMany({ data: [
      { userId: budi.id,  projectId: p.id, projectRole: "TEAM_LEADER" },
      { userId: rina.id,  projectId: p.id, projectRole: "ENGINEER"    },
      { userId: dhani.id, projectId: p.id, projectRole: "INSPECTOR"   },
    ]});

    const ups = path.join(process.cwd(), "uploads", p.id);
    const phases = await prisma.projectPhase.createManyAndReturn({ data: [
      { projectId: p.id, phase: "INISIASI",         isActive: true  },
      { projectId: p.id, phase: "ASSESSMENT",       isActive: false },
      { projectId: p.id, phase: "DESIGN",           isActive: false },
      { projectId: p.id, phase: "IMPLEMENTASI",     isActive: false },
      { projectId: p.id, phase: "COMMISSIONING",    isActive: false },
      { projectId: p.id, phase: "INSPEKSI_BERKALA", isActive: false },
    ]});
    const inisiasiPhase = phases.find((x: any) => x.phase === "INISIASI")!;

    // Kontrak baru disubmit, belum direview
    await createDoc(prisma, inisiasiPhase.id, budi.id, null, {
      documentType: "FILE_UPLOAD", status: "UNDER_REVIEW", visibility: "CLIENT_ACCESSIBLE",
      title: "Kontrak / SPK LPS Gedung Dinas PU Bandung",
      filePath: writeFile(ups, "kontrak-pemda.pdf", "Kontrak LPS Gedung Dinas PU Bandung"),
    });

    console.log(`✓ Gedung Dinas PU Bandung (PERENCANAAN, baru mulai inisiasi)`);
  }

  console.log("\n✅ Demo projects selesai!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => (prisma as any).$disconnect());
