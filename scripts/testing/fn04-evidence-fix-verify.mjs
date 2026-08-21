// Verifikasi TAMBAHAN untuk perbaikan FN-04 (toggleActionItem sekarang menolak
// penutupan tindak lanjut tanpa bukti YANG SESUAI, kalau requiredDocumentTypeId
// disyaratkan saat notulen dibuat).
//
// PENTING — kenapa script ini perlu ada terpisah dari notulen-tindak-lanjut.mjs
// yang sudah ada: script LAMA membuat action item TANPA requiredDocumentTypeId
// sama sekali (lihat body POST-nya: cuma { description, assignedToId }, tidak
// ada documentTypeId). Perbaikan yang diterapkan HANYA menolak penutupan tanpa
// bukti KALAU requiredDocumentTypeId memang di-set — jadi action item bebas-bentuk
// (tanpa syarat bukti) TETAP BOLEH ditutup tanpa dokumen apa pun, itu benar dan
// disengaja (bukan setiap tindak lanjut butuh bukti). Menjalankan ulang script
// lama TANPA modifikasi (sesuai aturan) akan TETAP menunjukkan FN-04 "Gagal" —
// bukan karena perbaikan tidak jalan, tapi karena skenario yang diuji di sana
// tidak pernah mensyaratkan bukti sama sekali. Script BARU ini menguji skenario
// yang benar-benar mencerminkan perbaikannya: action item YANG mensyaratkan
// bukti (persis seperti FN-01/FN-02), dicoba ditutup tanpa bukti.
import "dotenv/config";
import { writeFileSync } from "fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const PROJECT_TOWER_A = "cmsvrf4mc000wdnrjx6hgo2yt";
const USER_RINA = "cmsvrf3w1000sdnrjkhslq45d";
const DOC_TYPE_DOC = "cmsvrf2kv000ddnrjgmd2owtm"; // "DOC" — Dokumen Umum/Lainnya

const CRED = {
  TEAM_LEADER: { email: process.env.TEST_TEAM_LEADER_EMAIL, password: process.env.TEST_TEAM_LEADER_PASSWORD },
  ENGINEER: { email: process.env.TEST_ENGINEER_EMAIL, password: process.env.TEST_ENGINEER_PASSWORD },
};

async function login(role) {
  const jar = {};
  const setCookies = (res) => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.raw?.()["set-cookie"] ?? []);
    for (const c of raw) { const [pair] = c.split(";"); const [k, v] = pair.split("="); jar[k] = v; }
  };
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  setCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ email: CRED[role].email, password: CRED[role].password, csrfToken, json: "true" }), redirect: "manual",
  });
  setCookies(loginRes);
  return cookieHeader();
}

async function req(cookie, method, path, body) {
  const opts = { method, headers: {}, redirect: "manual" };
  if (cookie) opts.headers.Cookie = cookie;
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const status = res.status;
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status, json };
}

const results = [];
function record(kode, jenis, deskripsi, expected, actual, status) {
  results.push({ kode, jenis, deskripsi, expected, actual, status });
  console.log(`[${status}] ${kode} — ${deskripsi}`);
}

async function main() {
  const tlCookie = await login("TEAM_LEADER");
  const engCookie = await login("ENGINEER");

  // ── FN-04b: action item YANG MENSYARATKAN bukti (documentTypeId diisi), tutup TANPA bukti ──
  const notulenRes = await req(tlCookie, "POST", `/api/projects/${PROJECT_TOWER_A}/notulen`, {
    title: "Rapat Uji FN-04b (verifikasi perbaikan)", meetingDate: new Date().toISOString(),
    actionItems: [{ description: "Tindak lanjut uji FN-04b — mensyaratkan bukti", assignedToId: USER_RINA, requiredDocumentTypeId: DOC_TYPE_DOC }],
  });
  const itemId = notulenRes.json?.actionItems?.[0]?.id;
  const closeNoEvidence = await req(engCookie, "POST", `/api/notulen/${notulenRes.json.id}/action-items/${itemId}/close`, {});
  const fn04bPass = closeNoEvidence.status >= 400 && closeNoEvidence.status < 500;
  record("FN-04b", "Negative", "Tutup tindak lanjut yang MENSYARATKAN bukti (requiredDocumentTypeId diisi), tanpa melampirkan dokumen apa pun",
    "Ditolak (HTTP 4xx) — PERBAIKAN dari FN-04 asli",
    `HTTP ${closeNoEvidence.status} (${closeNoEvidence.json?.error ?? ""})`,
    fn04bPass ? "PASS" : "FAIL");

  // ── FN-04c: kontrol pembanding — tutup dengan bukti yang BENAR (jenis dokumen cocok) berhasil ──
  const fd = new FormData();
  fd.append("phase", "ASSESSMENT"); fd.append("documentTypeId", DOC_TYPE_DOC); fd.append("title", `Bukti FN-04c ${Date.now()}`);
  fd.append("file", new Blob([Buffer.from("bukti")]), "bukti-fn04c.pdf");
  const uploadReal = await fetch(`${BASE_URL}/api/projects/${PROJECT_TOWER_A}/documents`, { method: "POST", headers: { Cookie: engCookie }, body: fd });
  const uploadedDoc = await uploadReal.json();

  const notulen2Res = await req(tlCookie, "POST", `/api/projects/${PROJECT_TOWER_A}/notulen`, {
    title: "Rapat Uji FN-04c (kontrol pembanding)", meetingDate: new Date().toISOString(),
    actionItems: [{ description: "Tindak lanjut uji FN-04c — bukti benar", assignedToId: USER_RINA, requiredDocumentTypeId: DOC_TYPE_DOC }],
  });
  const item2Id = notulen2Res.json?.actionItems?.[0]?.id;
  const closeWithEvidence = await req(engCookie, "POST", `/api/notulen/${notulen2Res.json.id}/action-items/${item2Id}/close`, { linkedDocumentId: uploadedDoc.id });
  const fn04cPass = closeWithEvidence.status === 200 && closeWithEvidence.json?.status === "CLOSED";
  record("FN-04c", "Positive", "Kontrol pembanding: tutup tindak lanjut yang mensyaratkan bukti, DENGAN dokumen jenis yang benar-benar cocok",
    "Berhasil (HTTP 200, status=CLOSED) — memastikan perbaikan FN-04b tidak jadi terlalu ketat/salah blokir",
    `HTTP ${closeWithEvidence.status}, status=${closeWithEvidence.json?.status}`,
    fn04cPass ? "PASS" : "FAIL");

  // ── FN-04d: kontrol pembanding — action item TANPA syarat bukti sama sekali tetap bisa ditutup kosong ──
  const notulen3Res = await req(tlCookie, "POST", `/api/projects/${PROJECT_TOWER_A}/notulen`, {
    title: "Rapat Uji FN-04d (kontrol: tanpa syarat bukti)", meetingDate: new Date().toISOString(),
    actionItems: [{ description: "Tindak lanjut bebas-bentuk, tidak mensyaratkan bukti apa pun", assignedToId: USER_RINA }],
  });
  const item3Id = notulen3Res.json?.actionItems?.[0]?.id;
  const closeFreeform = await req(engCookie, "POST", `/api/notulen/${notulen3Res.json.id}/action-items/${item3Id}/close`, {});
  const fn04dPass = closeFreeform.status === 200 && closeFreeform.json?.status === "CLOSED";
  record("FN-04d", "Positive", "Kontrol pembanding: action item BEBAS-BENTUK (tidak pernah mensyaratkan bukti) tetap bisa ditutup tanpa dokumen — perbaikan tidak overreach",
    "Berhasil (HTTP 200, status=CLOSED)",
    `HTTP ${closeFreeform.status}, status=${closeFreeform.json?.status}`,
    fn04dPass ? "PASS" : "FAIL");

  const summary = {
    dijalankan: new Date().toISOString(),
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    hasil: results,
    temuan: [{
      catatan: "Kenapa script ini terpisah dari notulen-tindak-lanjut.mjs (FN-04 asli)",
      file: "scripts/testing/notulen-tindak-lanjut.mjs (TIDAK DIUBAH, sesuai aturan)",
      baris: "FN-04 block — action item dibuat tanpa documentTypeId",
      isi: "FN-04 asli membuat action item TANPA requiredDocumentTypeId, jadi tidak pernah mensyaratkan bukti — perbaikan toggleActionItem() (notulen.service.ts) HANYA menolak penutupan-tanpa-bukti kalau requiredDocumentTypeId di-set. Menjalankan ulang FN-04 asli tanpa modifikasi akan TETAP menunjukkan 'Gagal' (perilaku itu sendiri benar: action item bebas-bentuk memang boleh ditutup tanpa bukti). FN-04b/c/d di atas menguji skenario yang benar-benar relevan dengan perbaikan.",
    }],
  };
  writeFileSync("docs/pengujian/hasil-fn04-evidence-fix-verify.json", JSON.stringify(summary, null, 2) + "\n");
  console.log(`\n=== RINGKASAN: ${summary.pass}/${summary.total} PASS ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });
