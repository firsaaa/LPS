// FN-18..FN-24 — 7 skenario positive-case tambahan untuk menutup FR yang belum
// punya bukti keberhasilan alur normal lewat backend:
//   FR-01 (manajemen pengguna): FN-18, FN-19, FN-20
//   FR-06 (approval workflow) : FN-21, FN-22
//   FR-09 (keterlacakan)      : FN-23
//   FR-11 (ringkasan)         : FN-24
//
// Aturan sama seperti fn07-17-gap-closure.mjs: HTTP asli + sesi login asli
// terhadap lps_edms_test, tidak ada kode aplikasi yang diubah, kegagalan/
// temuan dilaporkan apa adanya (lihat findings[]).
//
// Dibaca dulu sebelum menulis test ini:
//   src/lib/services/user.service.ts, src/app/api/users/route.ts, src/app/api/users/[id]/route.ts
//   src/app/api/documents/[id]/approve/route.ts (VALID_TRANSITIONS, ACTION_MAP)
//   src/lib/services/document.service.ts (updateDocumentStatus, createDocumentVersion, updateCurrentVersionStatus)
//   src/app/api/documents/[id]/version/route.ts
//   src/lib/services/document-reference.service.ts, src/app/api/documents/[id]/references/route.ts
//   src/lib/services/project.service.ts (attachCompleteness)
//   prisma/schema.prisma (Document vs DocumentVersion fields)
import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const F = {
  projTowerA: "cmsvrf4mc000wdnrjx6hgo2yt",         // LGM
  phaseDesignTowerA: "cmsvrf4mo0012dnrjjwuxr62m",   // DESIGN, isActive=true
  docTypeDoc: "cmsvrf2kv000ddnrjgmd2owtm",          // "DOC" — catch-all, bukan bagian PhaseRequiredDocument manapun
  projLRH: "cmsvrf6mi002idnrjaaks0s1w",             // LPS Rumah Sakit Harapan Bunda (completedProject)
  docLRHCommissioningLog: "cmsvrf78r0033dnrj28ghqwfw", // Log Pengujian Commissioning RS Harapan Bunda, COMMISSIONING, APPROVED
  docLRHDesign: "cmsvrf6xo002vdnrjb5p9zvfd",        // Dokumen Desain LPS RS Harapan Bunda, DESIGN, APPROVED
};

const CRED = {
  SUPERADMIN: { email: process.env.TEST_SUPERADMIN_EMAIL, password: process.env.TEST_SUPERADMIN_PASSWORD },
  TEAM_LEADER: { email: process.env.TEST_TEAM_LEADER_EMAIL, password: process.env.TEST_TEAM_LEADER_PASSWORD }, // Budi
  ENGINEER: { email: process.env.TEST_ENGINEER_EMAIL, password: process.env.TEST_ENGINEER_PASSWORD },          // Rina
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

const results = [];
const findings = [];
function record(kode, jenis, deskripsi, expected, actual, status) {
  results.push({ kode, jenis, deskripsi, expected, actual, status });
  console.log(`[${status}] ${kode} — ${deskripsi}`);
  if (status !== "PASS") console.log(`    expected: ${expected}\n    actual  : ${actual}`);
}

async function uploadDraft(cookie, phaseId, phaseName, title) {
  const res = await reqUpload(
    cookie, `/api/projects/${F.projTowerA}/documents`,
    { phase: phaseName, documentTypeId: F.docTypeDoc, title },
    Buffer.from(`isi ${title}`), `${title.replace(/\s+/g, "-")}.pdf`
  );
  return res;
}

async function main() {
  const adminCookie = await login("SUPERADMIN");
  const tlCookie = await login("TEAM_LEADER"); // Budi
  const engCookie = await login("ENGINEER");   // Rina

  // ── FN-18: Superadmin membuat akun pengguna baru ────────────────────────────
  const newEmail = `uji-fn18-${Date.now()}@lps-edms-test.com`;
  const newPassword = "PasswordUjiFN18!";
  const fn18 = await req(adminCookie, "POST", "/api/users", { name: "User Uji FN-18", email: newEmail, password: newPassword });
  const fn18UserId = fn18.json?.id;
  const fn18DbUser = fn18UserId ? await prisma.user.findUnique({ where: { id: fn18UserId }, select: { id: true, email: true, passwordHash: true } }) : null;
  const fn18HashOk = !!fn18DbUser?.passwordHash && /^\$2[aby]\$/.test(fn18DbUser.passwordHash) && fn18DbUser.passwordHash !== newPassword;
  const fn18AuditLog = fn18UserId ? await prisma.auditLog.findFirst({ where: { entity: "user", entityId: fn18UserId } }) : null;
  const fn18Pass = fn18.status >= 200 && fn18.status < 300 && !!fn18DbUser && fn18HashOk;
  record("FN-18", "Positive", "Superadmin membuat akun pengguna baru melalui endpoint POST /api/users",
    "HTTP 2xx, user tersimpan, password tersimpan sebagai hash (bukan plaintext)",
    `HTTP ${fn18.status}; user tersimpan: ${!!fn18DbUser}; passwordHash berbentuk bcrypt & bukan plaintext: ${fn18HashOk}; tercatat di audit_log (entity=\"user\"): ${!!fn18AuditLog}`,
    fn18Pass ? "PASS" : "FAIL");
  if (!fn18AuditLog) {
    findings.push({
      catatan: "TEMUAN (bukan kegagalan FN-18 — soal 'kalau iya, sertakan pengecekannya' dari instruksi, jawabannya TIDAK)",
      file: "src/lib/services/user.service.ts (createUser) & src/app/api/users/route.ts (POST)",
      baris: "user.service.ts:41-58; users/route.ts:19-39",
      isi: "Pembuatan pengguna baru TIDAK menulis baris apa pun ke audit_log — tidak ada pemanggilan prisma.auditLog.create di createUser() maupun di route POST /api/users. Dibandingkan dengan aksi lain (upload dokumen, approve, link referensi, dst.) yang semuanya mencatat audit log, pembuatan akun pengguna adalah pengecualian. Kalau FR-01/FR-36 (jejak audit untuk 'aksi bermakna: buat, ubah, ...') dimaksudkan mencakup pembuatan akun, ini celah nyata yang perlu diputuskan: tambah audit log di createUser(), atau nyatakan eksplisit bahwa pembuatan akun user memang dikecualikan.",
    });
  }

  // ── FN-19: Superadmin mengubah data pengguna yang sudah ada ─────────────────
  const beforeUpdate = fn18UserId ? await prisma.user.findUnique({ where: { id: fn18UserId }, select: { updatedAt: true, name: true, isActive: true } }) : null;
  await new Promise((r) => setTimeout(r, 1100)); // pastikan updatedAt (presisi detik di beberapa DB) benar-benar berbeda
  const newName = "User Uji FN-19 (Diubah)";
  const fn19 = await req(adminCookie, "PATCH", `/api/users/${fn18UserId}`, { name: newName, isActive: false });
  const afterUpdate = fn18UserId ? await prisma.user.findUnique({ where: { id: fn18UserId }, select: { updatedAt: true, name: true, isActive: true } }) : null;
  const fn19Pass = fn19.status >= 200 && fn19.status < 300 && afterUpdate?.name === newName && afterUpdate?.isActive === false
    && beforeUpdate && afterUpdate.updatedAt.getTime() > beforeUpdate.updatedAt.getTime();
  record("FN-19", "Positive", "Superadmin mengubah data pengguna yang sudah ada (nama & status aktif) lewat PATCH /api/users/[id]",
    "HTTP 2xx, perubahan tersimpan di database, updatedAt berubah (bertambah)",
    `HTTP ${fn19.status}; name sesudah=\"${afterUpdate?.name}\"; isActive sesudah=${afterUpdate?.isActive}; updatedAt sebelum=${beforeUpdate?.updatedAt?.toISOString()}, sesudah=${afterUpdate?.updatedAt?.toISOString()}`,
    fn19Pass ? "PASS" : "FAIL");

  // ── FN-20: buat akun dengan email yang SUDAH terdaftar ──────────────────────
  const countBefore = await prisma.user.count({ where: { email: newEmail } });
  const fn20 = await req(adminCookie, "POST", "/api/users", { name: "Duplikat Email", email: newEmail, password: "lain123" });
  const countAfter = await prisma.user.count({ where: { email: newEmail } });
  const fn20Pass = fn20.status >= 400 && fn20.status < 500 && countAfter === countBefore && countAfter === 1;
  record("FN-20", "Negative", "Membuat akun dengan email yang sudah terdaftar (memakai email FN-18)",
    "Ditolak (HTTP 4xx), tidak ada baris user baru di database",
    `HTTP ${fn20.status} (${fn20.json?.error ?? ""}); jumlah baris dengan email ini sebelum=${countBefore}, sesudah=${countAfter}`,
    fn20Pass ? "PASS" : "FAIL");

  // ── FN-21: Engineer submit DRAFT, Team Leader approve ───────────────────────
  const fn21Upload = await uploadDraft(engCookie, F.phaseDesignTowerA, "DESIGN", `Uji FN-21 ${Date.now()}`);
  const fn21DocId = fn21Upload.json?.id;
  const statusAfterUpload = fn21Upload.json?.status;
  const fn21Submit = await req(engCookie, "POST", `/api/documents/${fn21DocId}/approve`, { action: "submit" });
  const statusAfterSubmit = fn21Submit.json?.status;
  const fn21Approve = await req(tlCookie, "POST", `/api/documents/${fn21DocId}/approve`, { action: "approve" });
  const statusAfterApprove = fn21Approve.json?.status;
  const fn21DbDoc = fn21DocId ? await prisma.document.findUnique({
    where: { id: fn21DocId },
    select: { status: true, reviewedById: true, reviewedAt: true },
  }) : null;
  const fn21CurrentVersion = fn21DocId ? await prisma.documentVersion.findFirst({
    where: { documentId: fn21DocId, isCurrent: true },
    select: { approvedById: true, approvedAt: true },
  }) : null;
  const transitionsOk = statusAfterUpload === "DRAFT" && statusAfterSubmit === "UNDER_REVIEW" && statusAfterApprove === "APPROVED" && fn21DbDoc?.status === "APPROVED";
  // FIX DITERAPKAN (atas persetujuan eksplisit penulis, lihat percakapan) di
  // updateDocumentStatus() (document.service.ts): saat auditAction === "APPROVE",
  // sekarang ikut men-set approvedById/approvedAt pada DocumentVersion yang
  // isCurrent=true — field itu SUDAH ADA di skema (sebelumnya cuma diisi oleh
  // endpoint terpisah PUT /api/documents/[id]/status), tidak ada migrasi baru.
  const approvedFieldsSet = !!fn21CurrentVersion?.approvedById && !!fn21CurrentVersion?.approvedAt;
  const fn21Pass = transitionsOk && approvedFieldsSet;
  record("FN-21", "Positive", "Engineer submit dokumen DRAFT, lalu Team Leader project menyetujuinya (POST .../approve)",
    "Status berpindah DRAFT -> UNDER_REVIEW -> APPROVED; approvedById dan approvedAt terisi",
    `Transisi status: ${statusAfterUpload} -> ${statusAfterSubmit} -> ${statusAfterApprove} (DB akhir: ${fn21DbDoc?.status}). DocumentVersion (isCurrent) approvedById=${fn21CurrentVersion?.approvedById}, approvedAt=${fn21CurrentVersion?.approvedAt?.toISOString()} (terisi: ${approvedFieldsSet}) — SETELAH PERBAIKAN updateDocumentStatus() di document.service.ts (lihat temuan riwayat sebelumnya: field ini sebelumnya tidak pernah terisi lewat endpoint ini, sekarang sudah diperbaiki atas persetujuan eksplisit penulis).`,
    fn21Pass ? "PASS" : "FAIL");
  findings.push({
    catatan: "RIWAYAT — FN-21 sebelumnya GAGAL (dilaporkan di sesi pengujian FN-18..24 sebelumnya), sudah DIPERBAIKI atas keputusan eksplisit penulis",
    file: "src/lib/services/document.service.ts (updateDocumentStatus)",
    baris: "~307-317 (blok baru: `if (params.auditAction === \"APPROVE\") { await tx.documentVersion.updateMany(...) }`)",
    isi: "Sebelum perbaikan: POST /api/documents/[id]/approve (action=approve) hanya mengisi Document.reviewedById/reviewedAt, TIDAK PERNAH mengisi DocumentVersion.approvedById/approvedAt (field itu HANYA diisi oleh endpoint terpisah PUT /api/documents/[id]/status lewat updateCurrentVersionStatus). Setelah dikonfirmasi ke penulis, updateDocumentStatus() sekarang JUGA meng-update DocumentVersion yang isCurrent=true dengan approvedById+approvedAt saat auditAction=APPROVE — tidak perlu migrasi skema baru karena kolom itu sudah ada. Ini SATU-SATUNYA perbaikan kode aplikasi yang dilakukan sepanjang pengujian Bagian A/B/C, atas instruksi eksplisit penulis (bukan inisiatif sendiri untuk membuat test lolos) — dua endpoint approval (Document-level via /approve, dan DocumentVersion-level via /status) tetap merupakan dua mekanisme yang secara struktur terpisah; perbaikan ini hanya menjembatani satu sisi (approve -> ikut isi approvedById/approvedAt versi), tidak menyatukan kedua mekanisme sepenuhnya.",
  });

  // ── FN-22: Team Leader minta revisi, lalu Engineer upload versi baru ────────
  const fn22Upload = await uploadDraft(engCookie, F.phaseDesignTowerA, "DESIGN", `Uji FN-22 ${Date.now()}`);
  const fn22DocId = fn22Upload.json?.id;
  await req(engCookie, "POST", `/api/documents/${fn22DocId}/approve`, { action: "submit" });
  const fn22Revise = await req(tlCookie, "POST", `/api/documents/${fn22DocId}/approve`, { action: "revise" });
  const statusAfterRevise = fn22Revise.json?.status;
  const fn22Version = await reqUpload(engCookie, `/api/documents/${fn22DocId}/version`, { changeNotes: "Perbaikan sesuai revisi" }, Buffer.from("versi baru FN-22"), "fn22-v2.pdf");
  const fn22DbDoc = fn22DocId ? await prisma.document.findUnique({ where: { id: fn22DocId }, select: { status: true } }) : null;
  const fn22VersionCount = fn22DocId ? await prisma.documentVersion.count({ where: { documentId: fn22DocId } }) : 0;
  const fn22Pass = statusAfterRevise === "REVISION_REQUESTED" && fn22Version.status === 201 && fn22VersionCount === 2;
  record("FN-22", "Positive", "Team Leader meminta revisi (action=revise) atas dokumen yang sedang UNDER_REVIEW, lalu Engineer upload versi baru",
    "Status berpindah ke status revisi yang berlaku di sistem (REVISION_REQUESTED); Engineer dapat meng-upload versi baru sesudahnya",
    `Status setelah revise: ${statusAfterRevise}. Upload versi baru: HTTP ${fn22Version.status}, jumlah versi dokumen sekarang=${fn22VersionCount}. Status Document SETELAH upload versi baru: ${fn22DbDoc?.status} (lihat temuan — createDocumentVersion() selalu me-reset status ke DRAFT)`,
    fn22Pass ? "PASS" : "FAIL");
  findings.push({
    catatan: "CATATAN (bukan kegagalan FN-22) — efek samping upload versi baru yang perlu diketahui",
    file: "src/lib/services/document.service.ts (createDocumentVersion)",
    baris: "379-382",
    isi: "Meng-upload versi baru (POST /api/documents/[id]/version) SELALU mereset Document.status kembali ke 'DRAFT' secara tanpa syarat (tx.document.update({ data: { ..., status: \"DRAFT\" } })) — tidak peduli status sebelumnya (di sini REVISION_REQUESTED). Jadi setelah Engineer upload versi revisi, dokumen tidak otomatis kembali ke UNDER_REVIEW/REVISION_REQUESTED, melainkan balik ke DRAFT, dan perlu di-submit ulang manual (action=submit) sebelum bisa direview lagi. Ini konsisten dengan siklus DRAFT->UNDER_REVIEW di §5 arsitektur, tapi kalau skripsi mendeskripsikan 'upload revisi langsung masuk review lagi', itu tidak sesuai — perlu submit ulang secara eksplisit.",
  });

  // ── FN-23: tautkan dokumen commissioning ke dokumen desain APPROVED fase sebelumnya, telusuri 2 arah ──
  const fn23Link = await req(tlCookie, "POST", `/api/documents/${F.docLRHCommissioningLog}/references`, { referencedDocumentId: F.docLRHDesign });
  const fromCommissioning = await req(tlCookie, "GET", `/api/documents/${F.docLRHCommissioningLog}/references`);
  const fromDesign = await req(tlCookie, "GET", `/api/documents/${F.docLRHDesign}/references`);
  const foundOutgoing = fromCommissioning.json?.references?.some((r) => r.referencedDocument?.id === F.docLRHDesign);
  const foundIncoming = fromDesign.json?.referencedBy?.some((r) => r.document?.id === F.docLRHCommissioningLog);
  const fn23Pass = fn23Link.status === 201 && foundOutgoing === true && foundIncoming === true;
  record("FN-23", "Positive", "Tautkan dokumen Commissioning (Log Pengujian) BASED_ON dokumen Desain APPROVED fase sebelumnya (LRH), telusuri dari kedua arah",
    "Relasi tersimpan; dapat ditelusuri dari dokumen turunan (outgoing/references) MAUPUN dari dokumen acuan (incoming/referencedBy)",
    `Link: HTTP ${fn23Link.status}. Dari dok. Commissioning (references, outgoing) memuat dok. Desain: ${foundOutgoing}. Dari dok. Desain (referencedBy, incoming) memuat dok. Commissioning: ${foundIncoming}`,
    fn23Pass ? "PASS" : "FAIL");
  // Bersih-bersih: hapus lagi tautan uji supaya tidak menambah data traceability permanen di LRH
  const createdRefId = fn23Link.json?.id;
  if (createdRefId) await req(tlCookie, "DELETE", `/api/documents/${F.docLRHCommissioningLog}/references/${createdRefId}`, undefined);

  // ── FN-24: bandingkan kelengkapan per fase (API) vs perhitungan manual dari DB ──
  const requiredDocs = await prisma.phaseRequiredDocument.findMany({ where: { isOptional: false }, select: { phase: true, documentTypeId: true } });
  const phasesRaw = await prisma.projectPhase.findMany({
    where: { projectId: F.projTowerA },
    select: { phase: true, documents: { select: { documentTypeId: true, status: true } } },
  });
  const manualByPhase = {};
  for (const ph of phasesRaw) {
    const required = requiredDocs.filter((r) => r.phase === ph.phase);
    const approvedTypeIds = new Set(ph.documents.filter((d) => d.status === "APPROVED").map((d) => d.documentTypeId));
    const fulfilled = required.filter((r) => r.documentTypeId && approvedTypeIds.has(r.documentTypeId)).length;
    const percent = required.length === 0 ? 100 : Math.round((fulfilled / required.length) * 100);
    manualByPhase[ph.phase] = { required: required.length, fulfilled, percent };
  }
  const fn24Api = await req(tlCookie, "GET", `/api/projects/${F.projTowerA}`, undefined);
  const apiByPhase = {};
  for (const p of fn24Api.json?.phases ?? []) apiByPhase[p.phase] = p.completeness;
  const phaseNames = Object.keys(manualByPhase);
  const mismatches = phaseNames.filter((ph) => apiByPhase[ph]?.percent !== manualByPhase[ph].percent || apiByPhase[ph]?.fulfilled !== manualByPhase[ph].fulfilled || apiByPhase[ph]?.required !== manualByPhase[ph].required);
  const fn24Pass = fn24Api.status === 200 && mismatches.length === 0;
  record("FN-24", "Positive", "Panggil GET /api/projects/[id] pada Tower A (komposisi dokumen diketahui dari query langsung), bandingkan kelengkapan per fase dengan perhitungan manual",
    "Seluruh angka kelengkapan (required, fulfilled, percent) per fase cocok dengan perhitungan manual dari database",
    `Manual: ${JSON.stringify(manualByPhase)}. API: ${JSON.stringify(apiByPhase)}. Fase yang tidak cocok: ${mismatches.length === 0 ? "tidak ada" : mismatches.join(", ")}`,
    fn24Pass ? "PASS" : "FAIL");

  // ── Tulis output ─────────────────────────────────────────────────────────
  const summary = {
    dijalankan: new Date().toISOString(),
    total: results.length,
    pass: results.filter((r) => r.status.startsWith("PASS")).length,
    fail: results.filter((r) => r.status === "FAIL").length,
    hasil: results,
    temuan: findings,
  };
  writeFileSync("docs/pengujian/hasil-fn18-24.json", JSON.stringify(summary, null, 2) + "\n");

  console.log(`\n=== RINGKASAN: ${summary.pass}/${summary.total} PASS ===`);
  console.log("Ditulis ke docs/pengujian/hasil-fn18-24.json");

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
