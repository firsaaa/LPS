import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { makeSimplePdf } from "./seed-pdf";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

// Real (if small) dummy PDFs per document type — every seeded document should
// be openable in the app, not just a metadata row (FR: "aku bisa buka dokumen
// itu di webnya"). Filename embeds the document code, matching production.
function contentForType(typeCode: string, title: string): string[] {
  switch (typeCode) {
    case "PRP": return [
      `PROPOSAL TEKNIS & PENAWARAN\n${title}`,
      "1. LATAR BELAKANG\nProposal ini diajukan sebagai penawaran jasa pengadaan dan pemasangan Sistem Proteksi Petir Eksternal sesuai standar IEC 62305, mencakup tahapan assessment risiko, desain, implementasi, hingga commissioning.",
      "2. LINGKUP PENAWARAN\nLingkup pekerjaan yang ditawarkan meliputi survey lokasi, kajian risiko sambaran petir, perhitungan rolling sphere, desain sistem terminasi udara dan pembumian, pemasangan, pengujian, serta penyerahan dokumen as-built.",
      "3. METODOLOGI\nPelaksanaan mengikuti metodologi standar IEC 62305 pada setiap tahap, dengan verifikasi dan dokumentasi di setiap fase sebelum berlanjut ke fase berikutnya.",
      "4. JADWAL & NILAI PENAWARAN\nEstimasi jadwal pelaksanaan dan rincian nilai penawaran (harga satuan dan total) dilampirkan secara terpisah, dapat disesuaikan setelah survey lokasi awal.",
      "5. PENUTUP\nDemikian proposal ini diajukan sebagai dasar pertimbangan sebelum penerbitan kontrak/SPK.",
    ];
    case "KTR": return [
      `PERJANJIAN KERJA / SURAT PERINTAH KERJA\n${title}`,
      "1. PARA PIHAK\nPerjanjian ini dibuat antara Pemberi Kerja (Klien) dan Pelaksana (Kontraktor) untuk pekerjaan pengadaan dan pemasangan Sistem Proteksi Petir Eksternal sesuai standar IEC 62305.",
      "2. RUANG LINGKUP PEKERJAAN\nPekerjaan meliputi survey lokasi, assessment risiko sambaran petir, desain sistem terminasi udara, down conductor, sistem pembumian (grounding), pengujian commissioning, hingga serah terima dokumen as-built.",
      "3. JANGKA WAKTU\nPekerjaan dilaksanakan sesuai jadwal proyek yang disepakati kedua belah pihak, dengan mekanisme perpanjangan bila terjadi kondisi force majeure atau perubahan lingkup pekerjaan.",
      "4. NILAI KONTRAK DAN PEMBAYARAN\nNilai kontrak dibayarkan secara bertahap sesuai capaian progress fisik pekerjaan dan persetujuan dokumen pada tiap fase proyek.",
      "5. KETENTUAN LAIN\nSeluruh dokumen teknis yang dihasilkan selama pelaksanaan proyek menjadi bagian tak terpisahkan dari kontrak ini dan disimpan dalam sistem manajemen dokumen elektronik (EDMS) proyek.",
    ];
    case "RSK": return [
      `LAPORAN ASSESSMENT RISIKO SAMBARAN PETIR\n${title}`,
      "1. RINGKASAN\nDokumen ini menyajikan hasil kajian risiko sambaran petir eksternal terhadap objek sesuai metodologi IEC 62305-2, sebagai dasar penentuan kebutuhan dan tingkat proteksi petir (Lightning Protection Level).",
      "2. DATA & PARAMETER\nKerapatan sambaran petir ke tanah (Ng) ditentukan berdasarkan data isokeraunik wilayah setempat. Dimensi bangunan, faktor lingkungan, dan jenis struktur turut menjadi parameter perhitungan area ekivalen tangkapan sambaran (Ad).",
      "3. PERHITUNGAN RISIKO\nRisiko R1 (risiko kehilangan nyawa manusia) dihitung dan dibandingkan terhadap risiko yang dapat diterima (tolerable risk, RT = 1e-5). Apabila R1 > RT, maka instalasi sistem proteksi petir menjadi wajib.",
      "4. REKOMENDASI TINGKAT PROTEKSI\nBerdasarkan hasil perhitungan, direkomendasikan Tingkat Proteksi Petir (LPL) beserta radius bola bergulir (rolling sphere radius) yang sesuai untuk desain sistem terminasi udara pada fase berikutnya.",
      "5. KESIMPULAN\nHasil assessment ini menjadi acuan utama pada tahap desain sistem proteksi petir eksternal maupun internal (SPD) pada proyek ini.",
    ];
    case "DES": return [
      `DOKUMEN DESAIN SISTEM PROTEKSI PETIR\n${title}`,
      "1. DASAR PERANCANGAN\nDesain mengacu pada hasil Laporan Assessment Risiko dan mengikuti persyaratan IEC 62305-3 untuk proteksi terhadap kerusakan fisik dan bahaya jiwa.",
      "2. SISTEM TERMINASI UDARA\nPenempatan air terminal (finial) menggunakan metode rolling sphere dan/atau sudut proteksi sesuai Tingkat Proteksi Petir (LPL) yang direkomendasikan, mencakup seluruh titik tertinggi dan sudut bangunan.",
      "3. SISTEM PENYALUR ARUS (DOWN CONDUCTOR)\nJalur down conductor dirancang seminimal mungkin secara elektrik lurus dan pendek, dengan jarak antar konduktor sesuai kelas LPL, serta dilengkapi terminal uji (test joint) di setiap titik pembumian.",
      "4. KOORDINASI DENGAN SISTEM LAIN\nDesain memperhitungkan bonding dengan instalasi logam bangunan dan sistem kelistrikan untuk mencegah sambaran samping (side flash) serta induksi tegangan lebih.",
      "5. GAMBAR TEKNIS\nGambar detail terlampir mencakup denah atap, potongan bangunan, dan detail sambungan konduktor.",
    ];
    case "RSF": return [
      `PERHITUNGAN ROLLING SPHERE METHOD\n${title}`,
      "1. METODE\nPerhitungan radius bola bergulir (rolling sphere radius) dilakukan sesuai Tabel 3 IEC 62305-3 berdasarkan Tingkat Proteksi Petir (LPL) yang direkomendasikan dari hasil assessment risiko.",
      "2. HASIL PERHITUNGAN\nRadius bola bergulir digunakan untuk menentukan zona terlindungi (protected volume) dari setiap air terminal, memastikan tidak terdapat titik pada bangunan yang tersentuh oleh bola imajiner tersebut.",
      "3. VERIFIKASI CAKUPAN\nSimulasi rolling sphere pada model 3D bangunan menunjukkan seluruh bagian atap dan elemen menonjol (menara air, unit HVAC, antena) berada dalam zona terlindungi.",
      "4. KESIMPULAN\nKonfigurasi air terminal yang diusulkan pada dokumen desain memenuhi cakupan proteksi sesuai radius bola bergulir yang dipersyaratkan.",
    ];
    case "GRD": return [
      `GROUNDING LAYOUT DAN PERHITUNGAN RESISTANSI PEMBUMIAN\n${title}`,
      "1. KONFIGURASI ELEKTRODA\nSistem pembumian menggunakan kombinasi elektroda batang (rod) dan elektroda pita (ring) yang ditanam mengelilingi bangunan, terhubung ke setiap down conductor melalui bak kontrol (test pit).",
      "2. TARGET RESISTANSI\nTarget resistansi pembumian ditetapkan maksimal 5 ohm (atau sesuai kondisi tanah setempat), diverifikasi melalui pengukuran fall-of-potential setelah instalasi selesai.",
      "3. KONDISI TANAH\nJenis tanah dan resistivitasnya memengaruhi jumlah dan kedalaman elektroda yang dibutuhkan; penambahan bentonit/grounding enhancement material dipertimbangkan pada area dengan resistivitas tinggi.",
      "4. EKUIPOTENSIAL BONDING\nSeluruh elektroda pembumian sistem proteksi petir diikat (bonding) dengan sistem pembumian instalasi listrik bangunan untuk mencapai potensial tanah yang seragam.",
    ];
    case "LHR": return [
      `LAPORAN HARIAN PELAKSANAAN PEKERJAAN\n${title}`,
      "1. RINGKASAN PEKERJAAN\nLaporan ini mencatat progres pekerjaan pemasangan komponen sistem proteksi petir pada hari berjalan, termasuk lokasi, jumlah tenaga kerja, dan material yang digunakan.",
      "2. URAIAN AKTIVITAS\nAktivitas mencakup pemasangan/penyambungan komponen sesuai gambar kerja, pemeriksaan kualitas sambungan, serta dokumentasi foto kondisi sebelum dan sesudah pekerjaan.",
      "3. KENDALA DAN TINDAK LANJUT\nKendala teknis maupun non-teknis yang ditemui di lapangan dicatat beserta rencana tindak lanjut penyelesaiannya.",
      "4. RENCANA HARI BERIKUTNYA\nRencana pekerjaan pada hari berikutnya disusun berdasarkan capaian hari ini dan jadwal induk proyek.",
    ];
    case "LOG": return [
      `LOG PENGUJIAN COMMISSIONING\n${title}`,
      "1. LINGKUP PENGUJIAN\nPengujian commissioning mencakup uji kontinuitas konduktor, pengukuran resistansi pembumian, serta uji fungsional Surge Protection Device (SPD) pada panel listrik.",
      "2. HASIL UJI KONTINUITAS\nSeluruh jalur down conductor diuji kontinuitasnya dari air terminal hingga titik pembumian; hasil: LULUS, tidak ditemukan indikasi putus atau sambungan longgar.",
      "3. HASIL UJI RESISTANSI PEMBUMIAN\nResistansi pembumian terukur berada di bawah nilai target yang dipersyaratkan pada seluruh titik ukur.",
      "4. HASIL UJI FUNGSIONAL SPD\nIndikator status SPD pada seluruh panel menunjukkan kondisi baik (belum terjadi surge event), koneksi kabel terpasang sesuai polaritas dan penampang yang dipersyaratkan.",
      "5. KESIMPULAN\nSistem proteksi petir dinyatakan LULUS commissioning dan siap dioperasikan.",
    ];
    case "ABD": return [
      `GAMBAR AS-BUILT SISTEM PROTEKSI PETIR\n${title}`,
      "1. TUJUAN\nDokumen as-built mencatat kondisi terpasang aktual di lapangan, termasuk deviasi terhadap gambar desain awal beserta alasannya.",
      "2. DEVIASI TERHADAP DESAIN\nBeberapa penyesuaian posisi air terminal dan jalur down conductor dilakukan menyesuaikan kondisi struktur eksisting di lapangan, tanpa mengurangi cakupan proteksi sesuai perhitungan rolling sphere.",
      "3. DOKUMENTASI TERPASANG\nGambar terlampir mencakup denah atap, jalur konduktor, dan titik pembumian sesuai kondisi terpasang, digunakan sebagai acuan pemeliharaan dan inspeksi berkala berikutnya.",
    ];
    case "CHK": return [
      `CHECKLIST VERIFIKASI PEMASANGAN\n${title}`,
      "1. KOMPONEN TERMINASI UDARA - Terpasang sesuai gambar desain: SESUAI",
      "2. SAMBUNGAN DOWN CONDUCTOR - Kontinuitas elektrik: SESUAI",
      "3. TITIK PEMBUMIAN (TEST JOINT) - Dapat diakses untuk pengujian: SESUAI",
      "4. BONDING KE INSTALASI LOGAM LAIN - Terhubung dan diikat dengan benar: SESUAI",
      "5. LABEL DAN IDENTITAS KOMPONEN - Tersedia dan terbaca jelas: SESUAI",
      "6. KEBERSIHAN & KERAPIAN INSTALASI - Area kerja bersih, tidak ada material sisa: SESUAI",
      "Kesimpulan: seluruh butir pemeriksaan verifikasi terpasang dinyatakan SESUAI, instalasi dapat dilanjutkan ke tahap commissioning.",
    ];
    case "LIB": return [
      `LAPORAN INSPEKSI BERKALA\n${title}`,
      "1. TUJUAN INSPEKSI\nInspeksi berkala dilakukan untuk memastikan sistem proteksi petir tetap berfungsi optimal sesuai IEC 62305-3, termasuk pemeriksaan visual dan pengukuran ulang resistansi pembumian.",
      "2. TEMUAN VISUAL\nKomponen terminasi udara, down conductor, dan titik sambungan diperiksa terhadap korosi, kelonggaran mekanis, atau kerusakan fisik akibat cuaca/lingkungan.",
      "3. HASIL PENGUKURAN ULANG\nResistansi pembumian diukur ulang dan dibandingkan dengan hasil pengujian commissioning sebelumnya untuk memastikan tidak terjadi degradasi signifikan.",
      "4. REKOMENDASI\nBerdasarkan temuan, disusun rekomendasi perawatan (bila diperlukan) serta jadwal inspeksi berkala berikutnya sesuai interval yang dipersyaratkan.",
    ];
    default: return [
      title,
      "Dokumen pendukung proyek instalasi sistem proteksi petir eksternal sesuai standar IEC 62305, disimpan sebagai bagian dari arsip dokumentasi proyek.",
    ];
  }
}

async function saveDummyFile(
  projectId: string, documentCode: string, versionNumber: number, typeCode: string, title: string
): Promise<{ filePath: string; contentText: string }> {
  const paragraphs = contentForType(typeCode, title);
  const buffer = makeSimplePdf(title, paragraphs);
  const storedName = `${documentCode}-v${versionNumber}.pdf`;
  const uploadDir = path.join(process.cwd(), "uploads", projectId);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, storedName), buffer);
  return { filePath: `/api/files/${projectId}/${storedName}`, contentText: paragraphs.join("\n\n") };
}

// Mirrors src/lib/services/document-code.service.ts (duplicated — standalone
// prisma/ scripts don't resolve the `@/` path alias under plain ts-node).
const PHASE_CODE: Record<string, string> = {
  INISIASI: "AWL", ASSESSMENT: "ASM", DESIGN: "DES",
  IMPLEMENTASI: "IMP", COMMISSIONING: "CMS", INSPEKSI_BERKALA: "INS",
};
async function generateDocumentCode(projectId: string, phase: string, typeCode: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const prefix = `${project.projectCode}-${PHASE_CODE[phase]}-${typeCode}-`;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.document.findMany({ where: { documentCode: { startsWith: prefix } }, select: { documentCode: true } });
    const maxSeq = existing.reduce((max, d) => {
      const seq = parseInt(d.documentCode!.slice(prefix.length), 10);
      return Number.isNaN(seq) ? max : Math.max(max, seq);
    }, 0);
    return `${prefix}${(maxSeq + 1).toString().padStart(3, "0")}`;
  }, { isolationLevel: "Serializable" });
}

const DOCUMENT_TYPES = [
  { typeCode: "PRP", name: "Proposal Teknis & Penawaran", retentionPeriodYears: 10, retentionTrigger: "PROJECT_COMPLETION" },
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

async function main() {
  // This seed creates accounts with intentionally weak, publicly-known
  // passwords (password123, admin123) for local demo/testing — never let it
  // run against a real deployment. ALLOW_PROD_SEED=1 is an explicit opt-out
  // for the rare case that's actually wanted (e.g. a fresh demo environment).
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    console.error(
      "✗ Refusing to seed: NODE_ENV=production. This seed creates demo accounts with weak, " +
      "well-known passwords — set ALLOW_PROD_SEED=1 if you really mean to run it here."
    );
    process.exit(1);
  }

  console.log("🌱 Seeding database...");

  // ─── Document Types (master, 13 tipe) ──────────────────────────────────────
  const codeToId: Record<string, string> = {};
  for (const t of DOCUMENT_TYPES) {
    const row = await prisma.documentTypeMaster.create({ data: t });
    codeToId[t.typeCode] = row.id;
  }
  console.log(`✓ ${DOCUMENT_TYPES.length} document types seeded`);

  // ─── Phase Required Documents (config table) ──────────────────────────────
  const phaseRequiredDocs = [
    { phase: "ASSESSMENT",       documentType: "LAPORAN_ASSESSMENT_RISIKO", typeCode: "RSK", label: "Laporan Assessment Risiko",   isOptional: false },
    { phase: "DESIGN",           documentType: "FILE_UPLOAD",               typeCode: "DES", label: "Dokumen Desain LPS",          isOptional: false },
    { phase: "DESIGN",           documentType: "FILE_UPLOAD",               typeCode: "RSF", label: "Perhitungan Rolling Sphere",  isOptional: false },
    { phase: "DESIGN",           documentType: "FILE_UPLOAD",               typeCode: "GRD", label: "Grounding Layout",            isOptional: false },
    { phase: "IMPLEMENTASI",     documentType: "FILE_UPLOAD",               typeCode: "LHR", label: "Laporan Harian / Progress",   isOptional: false },
    { phase: "COMMISSIONING",    documentType: "LOG_COMMISSIONING",         typeCode: "LOG", label: "Log Pengujian Commissioning", isOptional: false },
    { phase: "COMMISSIONING",    documentType: "FILE_UPLOAD",               typeCode: "ABD", label: "As-Built Drawing",            isOptional: false },
    { phase: "COMMISSIONING",    documentType: "FILE_UPLOAD",               typeCode: "CHK", label: "Checklist Verifikasi",        isOptional: false },
    { phase: "INSPEKSI_BERKALA", documentType: "LAPORAN_INSPEKSI_BERKALA",  typeCode: "LIB", label: "Laporan Inspeksi Berkala",    isOptional: false },
    { phase: "INISIASI",         documentType: "FILE_UPLOAD",               typeCode: "KTR", label: "Kontrak / SPK",               isOptional: false },
    { phase: "INISIASI",         documentType: "FILE_UPLOAD",               typeCode: "PRP", label: "Proposal Teknis & Penawaran", isOptional: false },
  ] as const;

  for (const doc of phaseRequiredDocs) {
    const { typeCode, ...data } = doc;
    await prisma.phaseRequiredDocument.create({ data: { ...data, documentTypeId: codeToId[typeCode] } });
  }
  console.log(`✓ ${phaseRequiredDocs.length} phase required documents seeded`);

  // ─── Users ────────────────────────────────────────────────────────────────
  const hash = (pw: string) => bcrypt.hash(pw, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@lps-edms.com" },
    update: {},
    create: {
      name: "Admin Sistem",
      email: "admin@lps-edms.com",
      passwordHash: await hash("admin123"),
      canLeadProject: false,
    },
  });
  // Compound unique lookups reject `null` in the where-key, so a global-scope
  // role (project_id NULL) is upserted via findFirst+create instead of .upsert().
  const ensureGlobalRole = async (userId: string, role: "SUPERADMIN" | "INSPECTOR") => {
    const existing = await prisma.userRole.findFirst({ where: { userId, projectId: null, role } });
    if (!existing) await prisma.userRole.create({ data: { userId, projectId: null, role } });
  };
  await ensureGlobalRole(admin.id, "SUPERADMIN");

  const budi = await prisma.user.upsert({
    where: { email: "budi.leader@lps-edms.com" },
    update: {},
    create: {
      name: "Budi Santoso",
      email: "budi.leader@lps-edms.com",
      passwordHash: await hash("password123"),
      canLeadProject: true,
    },
  });

  const rina = await prisma.user.upsert({
    where: { email: "rina.engineer@lps-edms.com" },
    update: {},
    create: {
      name: "Rina Wulandari",
      email: "rina.engineer@lps-edms.com",
      passwordHash: await hash("password123"),
      canLeadProject: false,
    },
  });

  const dhani = await prisma.user.upsert({
    where: { email: "dhani.inspector@lps-edms.com" },
    update: {},
    create: {
      name: "Dhani Pratama",
      email: "dhani.inspector@lps-edms.com",
      passwordHash: await hash("password123"),
      canLeadProject: false,
    },
  });
  // INSPECTOR is a global role — applies across every project
  await ensureGlobalRole(dhani.id, "INSPECTOR");

  const clientUser = await prisma.user.upsert({
    where: { email: "client@gedungmewah.com" },
    update: {},
    create: {
      name: "Ahmad Yani",
      email: "client@gedungmewah.com",
      passwordHash: await hash("password123"),
      canLeadProject: false,
    },
  });

  console.log("✓ 5 users seeded");

  // ─── Project ──────────────────────────────────────────────────────────────
  const project = await prisma.project.create({
    data: {
      name: "LPS Gedung Mewah Tower A",
      projectCode: "LGM",
      description: "Pemasangan sistem proteksi petir IEC 62305 pada gedung 20 lantai",
      client: "PT Gedung Mewah Properti",
      location: "Jakarta Selatan",
      status: "ACTIVE",
      startDate: new Date("2026-01-15"),
      targetEndDate: new Date("2026-12-31"),
      createdById: budi.id,
    },
  });

  // dhani (INSPECTOR) already has a global user_roles entry — no per-project row needed
  await prisma.userRole.createMany({
    data: [
      { userId: budi.id,       projectId: project.id, role: "TEAM_LEADER" },
      { userId: rina.id,       projectId: project.id, role: "ENGINEER"    },
      { userId: clientUser.id, projectId: project.id, role: "CLIENT"      },
    ],
  });

  // INISIASI, ASSESSMENT, DESIGN, IMPLEMENTASI aktif — sisanya belum
  await prisma.projectPhase.createMany({
    data: [
      { projectId: project.id, phase: "INISIASI",         isActive: true  },
      { projectId: project.id, phase: "ASSESSMENT",       isActive: true  },
      { projectId: project.id, phase: "DESIGN",           isActive: true  },
      { projectId: project.id, phase: "IMPLEMENTASI",     isActive: true  },
      { projectId: project.id, phase: "COMMISSIONING",    isActive: false },
      { projectId: project.id, phase: "INSPEKSI_BERKALA", isActive: false },
    ],
  });

  const getPhase = (phase: string) =>
    prisma.projectPhase.findUniqueOrThrow({ where: { projectId_phase: { projectId: project.id, phase: phase as any } } });

  const inisiasiPhase     = await getPhase("INISIASI");
  const assessmentPhase   = await getPhase("ASSESSMENT");
  const designPhase       = await getPhase("DESIGN");
  const implementasiPhase = await getPhase("IMPLEMENTASI");
  const commissioningPhase = await getPhase("COMMISSIONING");

  // ─── Sample Documents ─────────────────────────────────────────────────────
  const kontrakCode = await generateDocumentCode(project.id, "INISIASI", "KTR");
  const kontrakTitle = "Kontrak Kerja LPS Tower A";
  const kontrakFile = await saveDummyFile(project.id, kontrakCode, 1, "KTR", kontrakTitle);
  const kontrak = await prisma.document.create({
    data: {
      projectId:      project.id,
      projectPhaseId: inisiasiPhase.id,
      documentType:   "FILE_UPLOAD",
      documentTypeId: codeToId["KTR"],
      documentCode:   kontrakCode,
      title:          kontrakTitle,
      visibility:     "CLIENT_ACCESSIBLE",
      status:         "APPROVED",
      filePath:       kontrakFile.filePath,
      contentText:    kontrakFile.contentText,
      uploadedById:   budi.id,
      reviewedById:   budi.id,
      reviewedAt:     new Date("2026-01-20"),
    },
  });
  await prisma.documentVersion.create({
    data: { documentId: kontrak.id, versionNumber: 1, filePath: kontrakFile.filePath, isCurrent: true, status: "APPROVED", createdById: budi.id },
  });

  const assessmentCode = await generateDocumentCode(project.id, "ASSESSMENT", "RSK");
  const assessmentTitle = "Laporan Assessment Risiko LPS Tower A";
  const assessmentFile = await saveDummyFile(project.id, assessmentCode, 1, "RSK", assessmentTitle);
  const assessment = await prisma.document.create({
    data: {
      projectId:      project.id,
      projectPhaseId: assessmentPhase.id,
      documentType:   "LAPORAN_ASSESSMENT_RISIKO",
      documentTypeId: codeToId["RSK"],
      documentCode:   assessmentCode,
      title:          assessmentTitle,
      visibility:     "INTERNAL",
      status:         "APPROVED",
      filePath:       assessmentFile.filePath,
      contentText:    assessmentFile.contentText,
      uploadedById:   rina.id,
      reviewedById:   budi.id,
      reviewedAt:     new Date("2026-02-10"),
    },
  });
  await prisma.documentVersion.create({
    data: { documentId: assessment.id, versionNumber: 1, filePath: assessmentFile.filePath, isCurrent: true, status: "APPROVED", createdById: rina.id },
  });
  const desainCode = await generateDocumentCode(project.id, "DESIGN", "DES");
  const desainTitle = "Dokumen Desain LPS Tower A";
  const desainFileV1 = await saveDummyFile(project.id, desainCode, 1, "DES", desainTitle);
  const desainDoc = await prisma.document.create({
    data: {
      projectId:      project.id,
      projectPhaseId: designPhase.id,
      documentType:   "FILE_UPLOAD",
      documentTypeId: codeToId["DES"],
      documentCode:   desainCode,
      title:          desainTitle,
      visibility:     "INTERNAL",
      status:         "UNDER_REVIEW",
      filePath:       desainFileV1.filePath,
      contentText:    desainFileV1.contentText,
      uploadedById:   rina.id,
      assignedToId:   rina.id,
    },
  });
  await prisma.documentVersion.create({
    data: { documentId: desainDoc.id, versionNumber: 1, filePath: desainFileV1.filePath, isCurrent: true, createdById: rina.id },
  });

  // ─── Laporan Harian (daily progress uploads in IMPLEMENTASI) ───────────────
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const dailyReports = [
    { title: "Laporan Harian - Pemasangan Air Terminal Rooftop", daysAgo: 4 },
    { title: "Laporan Harian - Instalasi Down Conductor Lt. 15-20", daysAgo: 3 },
    { title: "Laporan Harian - Instalasi Down Conductor Lt. 10-14", daysAgo: 2 },
    { title: "Laporan Harian - Pemasangan Grounding Electrode", daysAgo: 1 },
  ];
  for (const report of dailyReports) {
    const lhrCode = await generateDocumentCode(project.id, "IMPLEMENTASI", "LHR");
    const lhrFile = await saveDummyFile(project.id, lhrCode, 1, "LHR", report.title);
    const doc = await prisma.document.create({
      data: {
        projectId:      project.id,
        projectPhaseId: implementasiPhase.id,
        documentType:   "FILE_UPLOAD",
        documentTypeId: codeToId["LHR"],
        documentCode:   lhrCode,
        title:          report.title,
        visibility:     "INTERNAL",
        status:         "APPROVED",
        filePath:       lhrFile.filePath,
        contentText:    lhrFile.contentText,
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
        filePath: lhrFile.filePath,
        isCurrent: true,
        status: "APPROVED",
        createdById: rina.id,
        createdAt: daysAgo(report.daysAgo),
      },
    });
  }
  console.log(`✓ ${dailyReports.length} laporan harian seeded`);

  // ─── Document assigned to the Team Leader — Notifikasi example for Budi ───
  const sloCode = await generateDocumentCode(project.id, "COMMISSIONING", "SLO");
  const sloTitle = "Sertifikat Laik Operasi Tower A";
  const sloFile = await saveDummyFile(project.id, sloCode, 1, "SLO", sloTitle);
  const sloDoc = await prisma.document.create({
    data: {
      projectId:      project.id,
      projectPhaseId: commissioningPhase.id,
      documentType:   "FILE_UPLOAD",
      documentTypeId: codeToId["SLO"],
      documentCode:   sloCode,
      title:          sloTitle,
      visibility:     "CLIENT_ACCESSIBLE",
      status:         "DRAFT",
      filePath:       sloFile.filePath,
      contentText:    sloFile.contentText,
      uploadedById:   rina.id,
      assignedToId:   budi.id,
    },
  });
  await prisma.documentVersion.create({
    data: { documentId: sloDoc.id, versionNumber: 1, filePath: sloFile.filePath, isCurrent: true, createdById: rina.id },
  });

  // ─── Notulen Rapat (meeting minutes) + Action Items ────────────────────────
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
      {
        notulenId:    designReviewNotulen.id,
        description:  "Koordinasikan jadwal commissioning dengan klien",
        assignedToId: budi.id,
        deadline:     daysAgo(-3),
        status:       "OPEN",
      },
    ],
  });
  console.log("✓ 2 notulen rapat with action items seeded");

  // ─── Version control example: desainDoc gets a real revision history ──────
  const desainFileV2 = await saveDummyFile(project.id, desainCode, 2, "DES", desainTitle);
  await prisma.documentVersion.update({
    where: { documentId_versionNumber: { documentId: desainDoc.id, versionNumber: 1 } },
    data: { isCurrent: false, status: "SUPERSEDED" },
  });
  await prisma.documentVersion.create({
    data: {
      documentId: desainDoc.id,
      versionNumber: 2,
      filePath: desainFileV2.filePath,
      isCurrent: true,
      status: "IN_REVIEW",
      changeNotes: "Revisi perhitungan rolling sphere pada zona atap sesuai catatan review internal",
      createdById: rina.id,
      createdAt: daysAgo(1),
    },
  });
  await prisma.document.update({
    where: { id: desainDoc.id },
    data: { filePath: desainFileV2.filePath, contentText: desainFileV2.contentText },
  });
  console.log("✓ Version control example seeded (Dokumen Desain LPS Tower A, v1→v2)");

  // ─── Example projects covering every ProjectStatus ─────────────────────────
  const allPhases = ["INISIASI", "ASSESSMENT", "DESIGN", "IMPLEMENTASI", "COMMISSIONING", "INSPEKSI_BERKALA"] as const;

  async function seedPhases(projectId: string, activeUntil: number) {
    await prisma.projectPhase.createMany({
      data: allPhases.map((phase, i) => ({ projectId, phase, isActive: i <= activeUntil })),
    });
    const rows = await prisma.projectPhase.findMany({ where: { projectId } });
    return Object.fromEntries(rows.map((r) => [r.phase, r])) as Record<string, { id: string }>;
  }

  async function seedApprovedDoc(
    projectId: string, phaseId: string, phase: string, typeCode: string, title: string,
    uploaderId: string, reviewerId: string, when: Date
  ) {
    const documentCode = await generateDocumentCode(projectId, phase, typeCode);
    const file = await saveDummyFile(projectId, documentCode, 1, typeCode, title);
    const doc = await prisma.document.create({
      data: {
        projectId, projectPhaseId: phaseId,
        documentType: "FILE_UPLOAD", documentTypeId: codeToId[typeCode],
        documentCode,
        title, visibility: "INTERNAL", status: "APPROVED",
        filePath: file.filePath, contentText: file.contentText,
        uploadedById: uploaderId, reviewedById: reviewerId, reviewedAt: when, createdAt: when,
      },
    });
    await prisma.documentVersion.create({
      data: { documentId: doc.id, versionNumber: 1, filePath: file.filePath, isCurrent: true, status: "APPROVED", createdById: uploaderId, createdAt: when },
    });
    return doc;
  }

  // -- PLANNING: brand-new project, nothing started yet --
  const planningProject = await prisma.project.create({
    data: {
      name: "LPS Pergudangan Cikarang",
      projectCode: "LPC",
      description: "Proyek baru, menunggu kontrak ditandatangani sebelum fase inisiasi dimulai",
      client: "PT Cikarang Logistik Utama",
      location: "Cikarang, Jawa Barat",
      status: "PLANNING",
      startDate: daysAgo(-14),
      targetEndDate: daysAgo(-200),
      createdById: budi.id,
    },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: budi.id, projectId: planningProject.id, role: "TEAM_LEADER" },
      { userId: rina.id, projectId: planningProject.id, role: "ENGINEER" },
    ],
  });
  await seedPhases(planningProject.id, -1); // nothing active yet

  // -- DELAYED: overdue target date, action item with a document requirement --
  const delayedProject = await prisma.project.create({
    data: {
      name: "LPS Gudang Logistik Selatan",
      projectCode: "LGS",
      description: "Instalasi tertunda karena revisi desain berulang; target selesai sudah lewat",
      client: "PT Gudang Selatan Nusantara",
      location: "Bekasi, Jawa Barat",
      status: "DELAYED",
      startDate: daysAgo(180),
      targetEndDate: daysAgo(10),
      createdById: budi.id,
    },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: budi.id, projectId: delayedProject.id, role: "TEAM_LEADER" },
      { userId: rina.id, projectId: delayedProject.id, role: "ENGINEER" },
    ],
  });
  const delayedPhases = await seedPhases(delayedProject.id, 3); // through IMPLEMENTASI
  await seedApprovedDoc(delayedProject.id, delayedPhases.INISIASI.id, "INISIASI", "KTR", "Kontrak Kerja Gudang Selatan", budi.id, budi.id, daysAgo(175));
  await seedApprovedDoc(delayedProject.id, delayedPhases.ASSESSMENT.id, "ASSESSMENT", "RSK", "Laporan Assessment Risiko Gudang Selatan", rina.id, budi.id, daysAgo(150));
  const delayedNotulen = await prisma.notulen.create({
    data: {
      projectId: delayedProject.id,
      title: "Evaluasi Keterlambatan Proyek",
      meetingDate: daysAgo(12),
      location: "Kantor PT Gudang Selatan Nusantara",
      attendees: "Budi Santoso, Rina Wulandari",
      discussion: "Proyek tertunda akibat revisi desain berulang. Disepakati percepatan fase commissioning begitu desain final disetujui.",
      createdById: budi.id,
    },
  });
  await prisma.actionItem.create({
    data: {
      notulenId: delayedNotulen.id,
      description: "Upload As-Built Drawing untuk fase commissioning",
      assignedToId: rina.id,
      deadline: daysAgo(3), // already overdue
      status: "OPEN",
      requiredPhase: "COMMISSIONING",
      requiredDocumentTypeId: codeToId["ABD"],
    },
  });

  // -- COMPLETED: every required document approved across all phases --
  const completedProject = await prisma.project.create({
    data: {
      name: "LPS Rumah Sakit Harapan Bunda",
      projectCode: "LRH",
      description: "Seluruh dokumen wajib telah disetujui dan sistem telah diserahterimakan",
      client: "Yayasan Rumah Sakit Harapan Bunda",
      location: "Bandung, Jawa Barat",
      status: "COMPLETED",
      startDate: daysAgo(400),
      targetEndDate: daysAgo(40),
      actualEndDate: daysAgo(35),
      createdById: budi.id,
    },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: budi.id, projectId: completedProject.id, role: "TEAM_LEADER" },
      { userId: rina.id, projectId: completedProject.id, role: "ENGINEER" },
    ],
  });
  const completedPhases = await seedPhases(completedProject.id, 5); // all active
  const completedRequiredDocs: { phase: string; typeCode: string; title: string }[] = [
    { phase: "INISIASI", typeCode: "KTR", title: "Kontrak Kerja RS Harapan Bunda" },
    { phase: "ASSESSMENT", typeCode: "RSK", title: "Laporan Assessment Risiko RS Harapan Bunda" },
    { phase: "DESIGN", typeCode: "DES", title: "Dokumen Desain LPS RS Harapan Bunda" },
    { phase: "DESIGN", typeCode: "RSF", title: "Perhitungan Rolling Sphere RS Harapan Bunda" },
    { phase: "DESIGN", typeCode: "GRD", title: "Grounding Layout RS Harapan Bunda" },
    { phase: "IMPLEMENTASI", typeCode: "LHR", title: "Laporan Harian Instalasi RS Harapan Bunda" },
    { phase: "COMMISSIONING", typeCode: "LOG", title: "Log Pengujian Commissioning RS Harapan Bunda" },
    { phase: "COMMISSIONING", typeCode: "ABD", title: "As-Built Drawing RS Harapan Bunda" },
    { phase: "COMMISSIONING", typeCode: "CHK", title: "Checklist Verifikasi RS Harapan Bunda" },
    { phase: "INSPEKSI_BERKALA", typeCode: "LIB", title: "Laporan Inspeksi Berkala RS Harapan Bunda" },
  ];
  for (const d of completedRequiredDocs) {
    await seedApprovedDoc(completedProject.id, completedPhases[d.phase].id, d.phase, d.typeCode, d.title, rina.id, budi.id, daysAgo(60));
  }

  // -- ARCHIVED: old, closed-out project kept for historical reference --
  const archivedProject = await prisma.project.create({
    data: {
      name: "LPS Gedung Parkir Mall Central",
      projectCode: "LGP",
      description: "Proyek lama, diarsipkan setelah masa retensi dokumen ditinjau",
      client: "PT Mall Central Indonesia",
      location: "Surabaya, Jawa Timur",
      status: "ARCHIVED",
      startDate: daysAgo(900),
      targetEndDate: daysAgo(700),
      actualEndDate: daysAgo(690),
      createdById: budi.id,
    },
  });
  await prisma.userRole.createMany({
    data: [{ userId: budi.id, projectId: archivedProject.id, role: "TEAM_LEADER" }],
  });
  const archivedPhases = await seedPhases(archivedProject.id, 1); // INISIASI + ASSESSMENT only
  await seedApprovedDoc(archivedProject.id, archivedPhases.INISIASI.id, "INISIASI", "KTR", "Kontrak Kerja Mall Central", budi.id, budi.id, daysAgo(895));
  await seedApprovedDoc(archivedProject.id, archivedPhases.ASSESSMENT.id, "ASSESSMENT", "RSK", "Laporan Assessment Risiko Mall Central", budi.id, budi.id, daysAgo(870));

  console.log("✓ 4 additional projects seeded (PLANNING, DELAYED, COMPLETED, ARCHIVED)");
  console.log("✓ 1 project with members, phases, and sample documents seeded");

  // ─── Tags: one consistent tag per document type, applied to every document ──
  // Criteria (so the tag list is never a surprise): a tag names the document's
  // TYPE category. Applied uniformly across every document in every project —
  // not a handful of hand-picked examples — so "what does this tag mean" always
  // has the same answer. Distinct from the "dokumen wajib" checklist, which
  // tracks per-phase completeness; tags exist purely for fast search/filtering.
  const TYPE_TAG: Record<string, string> = {
    PRP: "proposal", KTR: "kontrak", RSK: "risk-assessment", DES: "desain", RSF: "rolling-sphere",
    GRD: "grounding", LHR: "progress", LOG: "commissioning", ABD: "as-built",
    CHK: "checklist", LIB: "inspeksi-berkala", SLO: "sertifikasi", FOT: "dokumentasi", DOC: "umum",
  };
  const tagIdByName: Record<string, string> = {};
  for (const name of new Set(Object.values(TYPE_TAG))) {
    const tag = await prisma.tag.create({ data: { name } });
    tagIdByName[name] = tag.id;
  }
  const allDocs = await prisma.document.findMany({ include: { documentTypeMaster: true } });
  await prisma.documentTag.createMany({
    data: allDocs
      .filter((d) => d.documentTypeMaster)
      .map((d) => ({
        documentId: d.id,
        tagId: tagIdByName[TYPE_TAG[d.documentTypeMaster!.typeCode]],
        assignedById: d.uploadedById,
      })),
  });
  console.log(`✓ ${Object.keys(tagIdByName).length} tags seeded, applied consistently across ${allDocs.length} documents`);

  await prisma.auditLog.createMany({
    data: [
      { actorId: budi.id, action: "CREATE",       entity: "project",      entityId: project.id, projectId: project.id, detail: { name: project.name } },
      { actorId: budi.id, action: "PHASE_CHANGE", entity: "project_phase", projectId: project.id, detail: { phase: "ASSESSMENT", isActive: true } },
      { actorId: budi.id, action: "PHASE_CHANGE", entity: "project_phase", projectId: project.id, detail: { phase: "IMPLEMENTASI", isActive: true } },
    ],
  });

  console.log("✓ Audit logs seeded");
  console.log("\n✅ Seed selesai!");
  console.log("\nAkun login:");
  console.log("  SUPERADMIN  : admin@lps-edms.com           / admin123");
  console.log("  Team Leader : budi.leader@lps-edms.com     / password123");
  console.log("  Engineer    : rina.engineer@lps-edms.com   / password123");
  console.log("  Inspector   : dhani.inspector@lps-edms.com / password123");
  console.log("  Client      : client@gedungmewah.com        / password123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
