// FN-07..FN-17 — menutup 5 celah pengujian backend yang diminta penulis:
//   FR-04 (penyimpanan & klasifikasi dokumen): FN-07, FN-08, FN-09, FN-10, FN-11
//   FR-03 (manajemen fase, negative case)    : FN-12
//   FR-08 (pencarian dokumen, kebenaran)     : FN-13, FN-14
//   FR-09 (keterlacakan antardokumen, negative): FN-15, FN-16
//   FR-11 (ringkasan pemantauan, negative)   : FN-17
//
// Dijalankan HANYA terhadap server test lokal (lps_edms_test), lewat HTTP
// sungguhan (sesi login asli, bukan panggil service langsung). TIDAK ada kode
// aplikasi yang diubah untuk membuat test ini lolos — kalau perilaku sistem
// beda dari yang diharapkan, dicatat sebagai temuan (lihat findings[]), bukan
// diam-diam disesuaikan.
//
// Sebelum menulis test ini, kode berikut dibaca langsung (bukan diasumsikan):
//   prisma/schema.prisma, src/lib/services/document.service.ts,
//   src/lib/services/document-code.service.ts, src/lib/upload-stream.ts,
//   src/lib/services/document-reference.service.ts, src/lib/services/project.service.ts,
//   src/app/api/projects/[id]/documents/route.ts, src/app/api/documents/[id]/references/route.ts,
//   src/app/api/documents/[id]/route.ts, src/app/api/documents/search/route.ts,
//   src/types/index.ts (ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_SIZE_BYTES)
import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import xlsxLib from "xlsx";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── Fixture IDs (lps_edms_test) — dikumpulkan lewat query Prisma langsung sebelum menulis test ini ──
const F = {
  projTowerA: "cmsvrf4mc000wdnrjx6hgo2yt",       // LPS Gedung Mewah Tower A, projectCode "LGM"
  phaseAssessmentTowerA: "cmsvrf4mo0011dnrjm10vp6p3", // ASSESSMENT, isActive=true
  phaseImplementasiTowerA: "cmsvrf4mo0013dnrj9zh35pd0", // IMPLEMENTASI, isActive=true
  phaseCommissioningTowerA: "cmsvrf4mo0014dnrjggxvxv6j", // COMMISSIONING, isActive=FALSE — dipakai FN-12
  docTypeDoc: "cmsvrf2kv000ddnrjgmd2owtm",        // "DOC" — Dokumen Umum/Lainnya (catch-all, tidak dipakai PhaseRequiredDocument manapun)
  docTowerAApproved: "cmsvrf4xv0018dnrj8ytcauf3",  // Laporan Assessment Risiko LPS Tower A, project Tower A
  docMallCentral: "cmsvrf7he003jdnrjab5d6zfu",     // Kontrak Kerja Mall Central, project BEDA (LGP)
  projLRH: "cmsvrf6mi002idnrjaaks0s1w",            // LPS Rumah Sakit Harapan Bunda (completedProject)
  docLRHCommissioningLog: "cmsvrf78r0033dnrj28ghqwfw", // Log Pengujian Commissioning RS Harapan Bunda, APPROVED, required doc COMMISSIONING
};

const CRED = {
  TEAM_LEADER: { email: process.env.TEST_TEAM_LEADER_EMAIL, password: process.env.TEST_TEAM_LEADER_PASSWORD }, // Budi
  ENGINEER: { email: process.env.TEST_ENGINEER_EMAIL, password: process.env.TEST_ENGINEER_PASSWORD },          // Rina
  LEADER2: { email: "leader2@lps-edms-test.com", password: "password123" }, // TEAM_LEADER proyek lain, BUKAN anggota Tower A
};

async function login(role) {
  const jar = {};
  const setCookies = (res) => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.raw?.()["set-cookie"] ?? []);
    for (const c of raw) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      jar[k] = v;
    }
  };
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  setCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ email: CRED[role].email, password: CRED[role].password, csrfToken, json: "true" }),
    redirect: "manual",
  });
  setCookies(loginRes);
  return cookieHeader();
}

async function req(cookie, method, path, body) {
  const opts = { method, headers: {}, redirect: "manual" };
  if (cookie) opts.headers.Cookie = cookie;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const status = res.status;
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status, json };
}

// Field name tidak berpengaruh ke server (busboy tidak memfilter berdasarkan
// nama field, lihat upload-stream.ts bb.on("file", (_name, ...))) — HANYA
// nama file (filename) yang diperiksa untuk validasi ekstensi.
async function reqUpload(cookie, path, fields, fileBuffer, filename) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) fd.append(k, v);
  if (fileBuffer) fd.append("file", new Blob([fileBuffer]), filename);
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: { Cookie: cookie }, body: fd, redirect: "manual" });
  const status = res.status;
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status, json };
}

function buildRealXlsx(uniqueKeyword) {
  const wb = xlsxLib.utils.book_new();
  const ws = xlsxLib.utils.aoa_to_sheet([["catatan"], [`Isi berkas rahasia yang cuma bisa ditemukan lewat pencarian isi: ${uniqueKeyword}`]]);
  xlsxLib.utils.book_append_sheet(wb, ws, "Sheet1");
  return xlsxLib.write(wb, { type: "buffer", bookType: "xlsx" });
}

const results = [];
const findings = [];
function record(kode, jenis, deskripsi, expected, actual, status) {
  results.push({ kode, jenis, deskripsi, expected, actual, status });
  console.log(`[${status}] ${kode} — ${deskripsi}`);
  if (status !== "PASS") console.log(`    expected: ${expected}\n    actual  : ${actual}`);
}

async function main() {
  const tlCookie = await login("TEAM_LEADER"); // Budi
  const engCookie = await login("ENGINEER");   // Rina
  const leader2Cookie = await login("LEADER2");

  // ── Hitung seq berikutnya yang SEHARUSNYA muncul untuk prefix LGM-ASM-DOC- ──
  const prefix = "LGM-ASM-DOC-"; // projectCode(LGM) + PHASE_CODE.ASSESSMENT(ASM, lihat document-code.service.ts) + typeCode(DOC)
  const existingSameType = await prisma.document.findMany({
    where: { documentCode: { startsWith: prefix } },
    select: { documentCode: true },
  });
  const maxSeqBefore = existingSameType.reduce((max, d) => {
    const seq = parseInt(d.documentCode.slice(prefix.length), 10);
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);

  // ── FN-07: upload dokumen ke fase aktif dengan jenis dokumen valid ──────────
  const fn07Title = `Uji FN-07 ${Date.now()}`;
  const fn07 = await reqUpload(
    engCookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: "ASSESSMENT", documentTypeId: F.docTypeDoc, title: fn07Title },
    Buffer.from("isi dokumen uji FN-07"), "uji-fn07.pdf"
  );
  const fn07Doc = fn07.json;
  const fn07SavedCorrectly = fn07.status === 201 && fn07Doc?.projectPhaseId === F.phaseAssessmentTowerA && fn07Doc?.documentTypeId === F.docTypeDoc && !!fn07Doc?.documentCode;
  record("FN-07", "Positive", "Upload dokumen ke fase aktif (ASSESSMENT) dengan jenis dokumen valid (DOC)",
    "HTTP 201; document.projectPhaseId = fase yang dipilih; document.documentTypeId = jenis yang dipilih; documentCode terbentuk otomatis (tidak kosong)",
    `HTTP ${fn07.status}; projectPhaseId=${fn07Doc?.projectPhaseId}; documentTypeId=${fn07Doc?.documentTypeId}; documentCode=${fn07Doc?.documentCode}`,
    fn07SavedCorrectly ? "PASS" : "FAIL");

  // ── FN-08: periksa pola documentCode hasil FN-07 ────────────────────────────
  // Pola diambil LANGSUNG dari document-code.service.ts (buildCodePrefix + generateDocumentCode):
  // {projectCode}-{PHASE_CODE[phase]}-{typeCode}-{urut 3 digit, dimulai dari 001}
  const expectedSeqFn07 = maxSeqBefore + 1;
  const expectedCodeFn07 = `${prefix}${String(expectedSeqFn07).padStart(3, "0")}`;
  const fn08Pass = fn07Doc?.documentCode === expectedCodeFn07;
  record("FN-08", "Positive", "Pola documentCode hasil FN-07 sesuai document-code.service.ts (buildCodePrefix + generateDocumentCode)",
    `documentCode = "${expectedCodeFn07}" (prefix proyek+fase+tipe dari buildCodePrefix(), urut 3-digit dari generateDocumentCode())`,
    `documentCode = "${fn07Doc?.documentCode}"`,
    fn08Pass ? "PASS" : "FAIL");

  // ── FN-09: upload dokumen KEDUA, jenis+fase+proyek sama ─────────────────────
  const fn09 = await reqUpload(
    engCookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: "ASSESSMENT", documentTypeId: F.docTypeDoc, title: `Uji FN-09 ${Date.now()}` },
    Buffer.from("isi dokumen uji FN-09"), "uji-fn09.pdf"
  );
  const fn09Doc = fn09.json;
  const expectedSeqFn09 = maxSeqBefore + 2;
  const expectedCodeFn09 = `${prefix}${String(expectedSeqFn09).padStart(3, "0")}`;
  const fn09Pass = fn09.status === 201 && fn09Doc?.documentCode === expectedCodeFn09 && fn09Doc?.documentCode !== fn07Doc?.documentCode;
  record("FN-09", "Positive", "Upload dua dokumen berjenis sama pada project+fase yang sama — nomor urut bertambah, tidak duplikat",
    `Dokumen kedua mendapat documentCode "${expectedCodeFn09}" (bertambah 1 dari dokumen pertama), berbeda dari dokumen pertama`,
    `HTTP ${fn09.status}; documentCode kedua="${fn09Doc?.documentCode}"; documentCode pertama="${fn07Doc?.documentCode}"`,
    fn09Pass ? "PASS" : "FAIL");

  // ── FN-10: upload berkas dengan ekstensi di luar ALLOWED_UPLOAD_EXTENSIONS ──
  // (src/types/index.ts) — .exe TIDAK ada di daftar yang diizinkan.
  const fn10Title = `Uji FN-10 ${Date.now()}`;
  const fn10 = await reqUpload(
    engCookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: "ASSESSMENT", documentTypeId: F.docTypeDoc, title: fn10Title },
    Buffer.from("MZ fake binary"), "uji-fn10.exe"
  );
  const fn10DbCheck = await prisma.document.findFirst({ where: { title: fn10Title } });
  const fn10Pass = fn10.status >= 400 && fn10.status < 500 && !fn10DbCheck;
  record("FN-10", "Negative", "Upload berkas dengan ekstensi di luar daftar yang diizinkan (.exe, bukan bagian dari ALLOWED_UPLOAD_EXTENSIONS di src/types/index.ts)",
    "Ditolak (HTTP 4xx), dokumen TIDAK tersimpan di database",
    `HTTP ${fn10.status} (${fn10.json?.error ?? ""}); ditemukan di DB: ${!!fn10DbCheck}`,
    fn10Pass ? "PASS" : "FAIL");

  // ── FN-11: upload tanpa documentTypeId, DAN dengan documentTypeId yang tidak ada ──
  const fn11aTitle = `Uji FN-11a ${Date.now()}`;
  const fn11a = await reqUpload(
    engCookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: "ASSESSMENT", title: fn11aTitle }, // documentTypeId sengaja tidak dikirim
    Buffer.from("isi"), "uji-fn11a.pdf"
  );
  const fn11bTitle = `Uji FN-11b ${Date.now()}`;
  const fn11b = await reqUpload(
    engCookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: "ASSESSMENT", documentTypeId: "cmxxxxxxxxxxxxxxxxxxxxxxx", title: fn11bTitle }, // id tidak ada
    Buffer.from("isi"), "uji-fn11b.pdf"
  );
  const fn11aOk = fn11a.status >= 400 && fn11a.status < 500;
  const fn11bOk = fn11b.status >= 400 && fn11b.status < 500;
  record("FN-11", "Negative", "Upload dokumen tanpa documentTypeId, DAN dengan documentTypeId yang tidak ada di database",
    "Kedua kasus ditolak dengan HTTP 4xx",
    `Tanpa documentTypeId: HTTP ${fn11a.status} (${fn11a.json?.error ?? ""}). documentTypeId tidak ada: HTTP ${fn11b.status} (${fn11b.json?.error ?? ""})`,
    (fn11aOk && fn11bOk) ? "PASS" : "FAIL");

  // ── FN-12: upload ke fase yang isActive=false, sebagai ENGINEER ─────────────
  // PENTING (dibaca dari document.service.ts createProjectDocument, baris ~446-454):
  // fase non-aktif HANYA ditolak kalau pengunggah BUKAN TEAM_LEADER/Superadmin.
  // Kalau TEAM_LEADER/Superadmin yang upload ke fase non-aktif, fase itu justru
  // OTOMATIS diaktifkan (bukan ditolak) — lihat findings[] di bawah, ini BUKAN
  // gagal, tapi nuansa desain yang wajib diketahui sebelum ditulis di skripsi.
  const fn12Title = `Uji FN-12 ${Date.now()}`;
  const fn12 = await reqUpload(
    engCookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: "COMMISSIONING", documentTypeId: F.docTypeDoc, title: fn12Title },
    Buffer.from("isi"), "uji-fn12.pdf"
  );
  const fn12DbCheck = await prisma.document.findFirst({ where: { title: fn12Title } });
  const fn12Pass = fn12.status >= 400 && fn12.status < 500 && !fn12DbCheck;
  record("FN-12", "Negative", "Engineer upload dokumen ke fase COMMISSIONING milik Tower A, yang isActive=false",
    "Ditolak (HTTP 4xx), dokumen tidak tersimpan",
    `HTTP ${fn12.status} (${fn12.json?.error ?? ""}); ditemukan di DB: ${!!fn12DbCheck}`,
    fn12Pass ? "PASS" : "FAIL");
  findings.push({
    catatan: "NUANSA DESAIN (bukan kegagalan test) — dibaca langsung dari kode, tidak diuji ulang di sini supaya tidak mengubah state fase Tower A lebih lanjut",
    file: "src/lib/services/document.service.ts",
    baris: "446-454 (createProjectDocument)",
    isi: "Upload ke fase isActive=false HANYA ditolak (error \"phase_inactive\") kalau pengunggah BUKAN Team Leader/Superadmin (params.canActivatePhase === false). Kalau Team Leader ATAU Superadmin yang upload ke fase non-aktif, kode ini justru MENGAKTIFKAN fase tersebut secara otomatis (projectPhase.update isActive:true) lalu tetap mengizinkan upload — sama sekali tidak ditolak. Jadi FN-12 (\"Ditolak\") hanya benar untuk peran ENGINEER; untuk TEAM_LEADER/SUPERADMIN, perilaku sebenarnya adalah AUTO-AKTIVASI FASE + upload berhasil, bukan penolakan. Kalau skripsi mendeskripsikan aturan ini sebagai berlaku ke SEMUA peran, itu perlu diperbaiki rumusannya — atau kalau memang dimaksudkan sebagai perilaku khusus Team Leader (\"Team Leader bisa mengaktifkan fase implisit lewat upload\"), maka ini sesuai desain.",
  });

  // ── FN-13: cari kata kunci yang HANYA ada di isi berkas, bukan di judul ─────
  const uniqueKeyword = `KATAKUNCIUNIK${Date.now()}`;
  const fn13Title = `Dokumen Uji Pencarian Isi ${Date.now()}`; // sengaja TIDAK mengandung uniqueKeyword
  const xlsxBuf = buildRealXlsx(uniqueKeyword);
  const fn13Upload = await reqUpload(
    engCookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: "IMPLEMENTASI", documentTypeId: F.docTypeDoc, title: fn13Title },
    xlsxBuf, "uji-fn13-content.xlsx"
  );
  const fn13UploadedId = fn13Upload.json?.id;
  // Pastikan ekstraksi isi (contentText, sinkron untuk file < MAX_EXTRACT_BYTES) benar-benar menangkap kata kuncinya.
  const fn13DbDoc = fn13UploadedId ? await prisma.document.findUnique({ where: { id: fn13UploadedId }, select: { contentText: true } }) : null;
  const fn13Search = await req(engCookie, "GET", `/api/documents/search?keyword=${encodeURIComponent(uniqueKeyword)}`);
  const fn13Found = fn13Search.json?.results?.some((r) => r.id === fn13UploadedId);
  const fn13Pass = fn13Upload.status === 201 && !!fn13DbDoc?.contentText?.includes(uniqueKeyword) && fn13Found === true;
  record("FN-13", "Positive", "Cari dengan kata kunci yang hanya ada di dalam isi berkas (xlsx sungguhan), bukan di judul",
    "Dokumen yang benar muncul di hasil pencarian",
    `Upload HTTP ${fn13Upload.status}; contentText mengandung keyword: ${!!fn13DbDoc?.contentText?.includes(uniqueKeyword)}; muncul di hasil pencarian: ${fn13Found}; jumlah hasil: ${fn13Search.json?.count}`,
    fn13Pass ? "PASS" : "FAIL");

  // ── FN-14: user TANPA akses ke Tower A mencari kata kunci yang sama ─────────
  const fn14Search = await req(leader2Cookie, "GET", `/api/documents/search?keyword=${encodeURIComponent(uniqueKeyword)}`);
  const fn14Pass = fn14Search.status === 200 && (fn14Search.json?.count === 0) && !(fn14Search.json?.results ?? []).some((r) => r.id === fn13UploadedId);
  record("FN-14", "Negative", "User (leader2, TEAM_LEADER proyek lain, BUKAN anggota Tower A) mencari kata kunci yang hanya ada pada dokumen milik Tower A",
    "Hasil kosong — dokumen proyek yang tidak diikuti tidak bocor lewat pencarian isi",
    `HTTP ${fn14Search.status}; count=${fn14Search.json?.count}; dokumen Tower A ikut muncul: ${(fn14Search.json?.results ?? []).some((r) => r.id === fn13UploadedId)}`,
    fn14Pass ? "PASS" : "FAIL");

  // ── FN-15: tautkan dokumen ke dokumen di PROYEK BERBEDA ─────────────────────
  const fn15 = await req(engCookie, "POST", `/api/documents/${F.docTowerAApproved}/references`, { referencedDocumentId: F.docMallCentral });
  const fn15Pass = fn15.status >= 400 && fn15.status < 500;
  record("FN-15", "Negative", "Menautkan dokumen (Tower A) ke dokumen yang berada di project berbeda (Mall Central)",
    "Ditolak (HTTP 4xx, error different_project)",
    `HTTP ${fn15.status} (${fn15.json?.error ?? ""})`,
    fn15Pass ? "PASS" : "FAIL");

  // ── FN-16: tautkan dokumen ke DIRINYA SENDIRI ───────────────────────────────
  const fn16 = await req(engCookie, "POST", `/api/documents/${F.docTowerAApproved}/references`, { referencedDocumentId: F.docTowerAApproved });
  const fn16Pass = fn16.status >= 400 && fn16.status < 500;
  record("FN-16", "Negative", "Menautkan dokumen ke dirinya sendiri",
    "Ditolak (HTTP 4xx, error self_reference)",
    `HTTP ${fn16.status} (${fn16.json?.error ?? ""})`,
    fn16Pass ? "PASS" : "FAIL");

  // ── FN-17: arsipkan 1 dokumen wajib yang APPROVED, cek kelengkapan turun ────
  const beforeDetail = await req(tlCookie, "GET", `/api/projects/${F.projLRH}`);
  const beforePhase = beforeDetail.json?.phases?.find((p) => p.phase === "COMMISSIONING");
  const beforePercent = beforePhase?.completeness?.percent;

  const archiveRes = await req(tlCookie, "DELETE", `/api/documents/${F.docLRHCommissioningLog}`, undefined);

  const afterDetail = await req(tlCookie, "GET", `/api/projects/${F.projLRH}`);
  const afterPhase = afterDetail.json?.phases?.find((p) => p.phase === "COMMISSIONING");
  const afterPercent = afterPhase?.completeness?.percent;
  const afterDocStatus = await prisma.document.findUnique({ where: { id: F.docLRHCommissioningLog }, select: { status: true } });

  const fn17Pass = archiveRes.status === 200 && afterDocStatus?.status === "ARCHIVED" && typeof beforePercent === "number" && typeof afterPercent === "number" && afterPercent < beforePercent;
  record("FN-17", "Negative", "Arsipkan satu dokumen wajib (APPROVED, required doc fase COMMISSIONING proyek LRH), lalu panggil GET /api/projects/[id] untuk kelengkapan fase",
    "Dokumen berstatus ARCHIVED tidak dihitung lagi sebagai dokumen lengkap; persentase kelengkapan fase COMMISSIONING turun",
    `Arsip: HTTP ${archiveRes.status}, status dokumen sesudah=${afterDocStatus?.status}. Kelengkapan COMMISSIONING sebelum=${beforePercent}%, sesudah=${afterPercent}%`,
    fn17Pass ? "PASS" : "FAIL");

  // Pulihkan fixture: kembalikan dokumen ke APPROVED lagi supaya proyek demo LRH
  // (dipakai test lain sebagai contoh "semua fase 100% lengkap") tidak rusak permanen.
  if (afterDocStatus?.status === "ARCHIVED") {
    await prisma.document.update({ where: { id: F.docLRHCommissioningLog }, data: { status: "APPROVED" } });
    console.log("(Dipulihkan: dokumen LRH-CMS-LOG-001 dikembalikan ke APPROVED setelah verifikasi FN-17)");
  }

  // ── Tulis output ─────────────────────────────────────────────────────────
  const summary = {
    dijalankan: new Date().toISOString(),
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    hasil: results,
    temuan: findings,
  };
  writeFileSync("docs/pengujian/hasil-fn07-17-gap-closure.json", JSON.stringify(summary, null, 2) + "\n");

  console.log(`\n=== RINGKASAN: ${summary.pass}/${summary.total} PASS ===`);
  console.log("Ditulis ke docs/pengujian/hasil-fn07-17-gap-closure.json");

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
