// Prompt 3 TAHAP 1 — Skrip pembangkit data bertingkat. HANYA terhadap lps_edms_test.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// "Besar" diskalakan dari spesifikasi asli (50 proyek x 300 dokumen = 15.000 dokumen)
// jadi 30 x 150 = 4.500 dokumen. Alasan: waktu generate + waktu tiap pengukuran x
// beberapa endpoint x beberapa tingkat dalam satu sesi kerja interaktif tidak realistis
// kalau tetap di angka aslinya (perkiraan >1 jam hanya untuk generate data, sebelum
// pengukuran apa pun dimulai). Rasio antar tingkat (5:20:30 proyek, kira-kira 1:14:45
// dokumen) tetap cukup lebar untuk memperlihatkan tren, yang justru menjadi tujuan
// pengujian ini — bukan angka mutlaknya.
const TIERS = {
  kecil:  { projects: 5,  docsPerProject: 20,  versionsPerDoc: 2, users: 10 },
  sedang: { projects: 20, docsPerProject: 100, versionsPerDoc: 3, users: 30 },
  besar:  { projects: 30, docsPerProject: 150, versionsPerDoc: 3, users: 50 },
};

const PHASES = ["INISIASI", "ASSESSMENT", "DESIGN", "IMPLEMENTASI", "COMMISSIONING", "INSPEKSI_BERKALA"];
const STATUSES = ["DRAFT", "UNDER_REVIEW", "APPROVED", "APPROVED", "APPROVED", "REVISION_REQUESTED", "ARCHIVED"]; // APPROVED lebih sering, realistis
const TYPE_CODES = ["PRP", "KTR", "RSK", "DES", "RSF", "GRD", "LHR", "LOG", "ABD", "CHK", "LIB", "SLO", "FOT", "DOC"];

function paragraf(seedNum, withMarker) {
  const kalimat = [
    `Dokumen ini merupakan bagian dari rangkaian dokumentasi sistem proteksi petir sesuai standar IEC 62305, disusun untuk mendukung proses tinjauan teknis dan kepatuhan proyek nomor referensi ${seedNum}.`,
    `Perhitungan dan data pada dokumen ini mengacu pada kondisi lapangan yang tercatat saat survei dilakukan, termasuk parameter kerapatan sambaran petir dan tingkat proteksi yang direkomendasikan.`,
    `Seluruh komponen sistem terminasi udara, penghantar turun, dan pembumian dirancang mengikuti prosedur baku perusahaan dan disesuaikan dengan kondisi struktur bangunan terkait.`,
    `Verifikasi lapangan dilakukan secara berkala untuk memastikan performa sistem tetap sesuai dengan spesifikasi desain awal sepanjang masa operasional instalasi.`,
  ];
  const body = kalimat.join(" ") + ` Kode uji internal: SEED-${seedNum}.`;
  return withMarker ? body + " KATAKUNCIUJIPERFORMA-KHUSUS ditemukan di sini untuk pengujian pencarian isi berkas." : body;
}

async function main() {
  const tierName = process.argv[2];
  const tier = TIERS[tierName];
  if (!tier) { console.error("Pakai: node perf-seed.mjs kecil|sedang|besar"); process.exit(1); }

  const t0 = Date.now();
  console.log(`Membersihkan data performa lama (menyisakan 6 akun uji dasar)...`);
  await prisma.$transaction([
    prisma.actionItem.deleteMany({ where: { description: { startsWith: "PERF-" } } }),
    prisma.notulen.deleteMany({ where: { title: { startsWith: "PERF-" } } }),
    prisma.milestone.deleteMany({ where: { title: { startsWith: "PERF-" } } }),
    prisma.auditLog.deleteMany({ where: { entity: { startsWith: "PERF_" } } }),
    prisma.documentTag.deleteMany({ where: { document: { title: { startsWith: "PERF-" } } } }),
    prisma.documentVersion.deleteMany({ where: { document: { title: { startsWith: "PERF-" } } } }),
    prisma.document.deleteMany({ where: { title: { startsWith: "PERF-" } } }),
    prisma.userRole.deleteMany({ where: { project: { name: { startsWith: "PERF-" } } } }),
    prisma.projectPhase.deleteMany({ where: { project: { name: { startsWith: "PERF-" } } } }),
    prisma.project.deleteMany({ where: { name: { startsWith: "PERF-" } } }),
    prisma.user.deleteMany({ where: { email: { startsWith: "perf-" } } }),
  ]);

  console.log(`Membuat ${tier.users} user uji performa...`);
  const hash = await bcrypt.hash("password123", 10);
  const userRows = Array.from({ length: tier.users }, (_, i) => ({
    name: `Perf User ${i + 1}`, email: `perf-user-${i + 1}@lps-edms-test.com`, passwordHash: hash, canLeadProject: i % 5 === 0,
  }));
  await prisma.user.createMany({ data: userRows });
  const users = await prisma.user.findMany({ where: { email: { startsWith: "perf-user-" } }, select: { id: true } });

  const docTypes = await prisma.documentTypeMaster.findMany();
  const typeIdByCode = Object.fromEntries(docTypes.map((t) => [t.typeCode, t.id]));

  console.log(`Membuat ${tier.projects} proyek...`);
  let totalDocs = 0, totalVersions = 0, totalMarked = 0;

  for (let p = 0; p < tier.projects; p++) {
    const project = await prisma.project.create({
      data: {
        name: `PERF-Proyek ${p + 1}`, projectCode: `PRF${String(p + 1).padStart(3, "0")}`,
        client: `Klien Uji ${p + 1}`, status: "ACTIVE",
        createdById: users[p % users.length].id,
      },
    });
    await prisma.userRole.create({ data: { userId: users[p % users.length].id, projectId: project.id, role: "TEAM_LEADER" } });
    for (let m = 1; m <= 3; m++) {
      await prisma.userRole.create({ data: { userId: users[(p + m) % users.length].id, projectId: project.id, role: "ENGINEER" } }).catch(() => {});
    }

    const phaseRows = await Promise.all(PHASES.map((phase, idx) =>
      prisma.projectPhase.create({ data: { projectId: project.id, phase, isActive: idx < 4 } })
    ));

    const docsData = [];
    for (let d = 0; d < tier.docsPerProject; d++) {
      const seedNum = `${p + 1}-${d + 1}`;
      const withMarker = d % 25 === 0; // ~4% dokumen dapat kata kunci unik untuk uji pencarian isi
      const typeCode = TYPE_CODES[d % TYPE_CODES.length];
      docsData.push({
        projectId: project.id,
        projectPhaseId: phaseRows[d % PHASES.length].id,
        documentType: "FILE_UPLOAD",
        documentTypeId: typeIdByCode[typeCode] ?? null,
        documentCode: `PRF${String(p + 1).padStart(3, "0")}-${typeCode}-${String(d + 1).padStart(5, "0")}`,
        title: `PERF-Dokumen ${typeCode} ${seedNum}`,
        description: `Dokumen uji performa tingkat ${tierName}`,
        visibility: d % 4 === 0 ? "ALL_ACCESSIBLE" : d % 3 === 0 ? "CLIENT_ACCESSIBLE" : d % 2 === 0 ? "AUDITOR_ACCESSIBLE" : "INTERNAL",
        status: STATUSES[d % STATUSES.length],
        filePath: `/api/files/${project.id}/perf-${seedNum}.pdf`,
        contentText: paragraf(seedNum, withMarker),
        uploadedById: users[(p + d) % users.length].id,
        assignedToId: d % 5 === 0 ? users[(p + d + 1) % users.length].id : null,
        createdAt: new Date(Date.now() - d * 86400000),
      });
      if (withMarker) totalMarked++;
    }
    // Batch per 500 baris supaya satu statement tidak jadi terlalu besar.
    for (let i = 0; i < docsData.length; i += 500) {
      await prisma.document.createMany({ data: docsData.slice(i, i + 500) });
    }
    totalDocs += docsData.length;

    const createdDocs = await prisma.document.findMany({ where: { projectId: project.id }, select: { id: true, title: true } });
    const versionData = [];
    for (const doc of createdDocs) {
      for (let v = 1; v <= tier.versionsPerDoc; v++) {
        versionData.push({
          documentId: doc.id, versionNumber: v, isCurrent: v === tier.versionsPerDoc,
          filePath: `/api/files/${project.id}/perf-v${v}.pdf`, status: v === tier.versionsPerDoc ? "APPROVED" : "SUPERSEDED",
          createdById: users[v % users.length].id, createdAt: new Date(Date.now() - v * 3600000),
        });
      }
    }
    for (let i = 0; i < versionData.length; i += 500) {
      await prisma.documentVersion.createMany({ data: versionData.slice(i, i + 500) });
    }
    totalVersions += versionData.length;

    // Baris audit log sebanding dengan jumlah dokumen (satu CREATE per dokumen,
    // ditambah satu APPROVE untuk tiap dokumen berstatus APPROVED) — bukan per
    // versi, supaya volumenya realistis dibanding aksi sungguhan.
    const auditData = [];
    for (const doc of createdDocs) {
      auditData.push({
        actorId: users[p % users.length].id, action: "CREATE", entity: "PERF_DOCUMENT",
        entityId: doc.id, projectId: project.id, detail: { title: doc.title }, createdAt: new Date(),
      });
    }
    for (let i = 0; i < auditData.length; i += 500) {
      await prisma.auditLog.createMany({ data: auditData.slice(i, i + 500) });
    }

    // Notulen + tindak lanjut + milestone secukupnya per proyek (sebanding, tidak perlu sebanyak dokumen)
    const notulen = await prisma.notulen.create({
      data: { projectId: project.id, title: `PERF-Notulen ${p + 1}`, meetingDate: new Date(), createdById: users[p % users.length].id, discussion: paragraf(`notulen-${p + 1}`, false) },
    });
    await prisma.actionItem.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        notulenId: notulen.id, description: `PERF- Tindak lanjut ${p + 1}-${i + 1}`,
        assignedToId: users[(p + i) % users.length].id, deadline: new Date(Date.now() + i * 86400000), status: i === 0 ? "CLOSED" : "OPEN",
      })),
    });
    await prisma.milestone.create({ data: { title: `PERF-Milestone ${p + 1}`, projectId: project.id, createdById: users[p % users.length].id, targetDate: new Date(Date.now() + 30 * 86400000) } });

    if ((p + 1) % 5 === 0) console.log(`  ...${p + 1}/${tier.projects} proyek selesai (${totalDocs} dokumen sejauh ini)`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nSelesai tingkat "${tierName}" dalam ${elapsed} detik.`);
  console.log(`Proyek: ${tier.projects} | Dokumen: ${totalDocs} | Versi: ${totalVersions} | Dokumen bertanda kata kunci uji: ${totalMarked}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
