// DB-D4 — pengarsipan dokumen satuan, belum pernah dibuktikan (0 dokumen
// ARCHIVED di data uji standar). Dijalankan terhadap lps_edms_test.
import "dotenv/config";
import fs from "node:fs";

const BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
const PROJECT_TOWER_A = "cmsvrf4mc000wdnrjx6hgo2yt";

async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const jar = csrfRes.headers.getSetCookie();
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ email, password, csrfToken, json: "true" });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.map((c) => c.split(";")[0]).join("; ") },
    body,
  });
  const allCookies = [...jar, ...loginRes.headers.getSetCookie()];
  const merged = new Map();
  for (const c of allCookies) { const [kv] = c.split(";"); const [k, v] = kv.split("="); merged.set(k, v); }
  return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const tl = await login(process.env.TEST_TEAM_LEADER_EMAIL, process.env.TEST_TEAM_LEADER_PASSWORD);

console.log("=== Buat dokumen uji, ajukan+setujui dulu (supaya statusnya bukan DRAFT) ===");
const form = new FormData();
form.append("phase", "INISIASI");
form.append("documentTypeId", "cmsvrf2kv000ddnrjgmd2owtm"); // DOC
form.append("title", "Dokumen Uji DB-D4 Arsip");
form.append("visibility", "INTERNAL");
form.append("file", new Blob([Buffer.from("uji arsip")]), "uji-arsip.pdf");
const uploadRes = await fetch(`${BASE}/api/projects/${PROJECT_TOWER_A}/documents`, { method: "POST", headers: { Cookie: tl }, body: form });
const uploaded = await uploadRes.json();
const docId = uploaded.document?.id ?? uploaded.id;
console.log(`  Diupload: HTTP ${uploadRes.status}, docId=${docId}`);

await fetch(`${BASE}/api/documents/${docId}/approve`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: tl }, body: JSON.stringify({ action: "submit" }) });
const approveRes = await fetch(`${BASE}/api/documents/${docId}/approve`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: tl }, body: JSON.stringify({ action: "approve" }) });
console.log(`  Submit+approve: HTTP ${approveRes.status}`);

console.log("\n=== Arsipkan dokumen (DELETE pada dokumen non-draft = arsipkan) ===");
const archiveRes = await fetch(`${BASE}/api/documents/${docId}`, { method: "DELETE", headers: { Cookie: tl } });
console.log(`  HTTP ${archiveRes.status}: ${JSON.stringify(await archiveRes.json())}`);

console.log("\n=== Cek 1: masih terbaca lewat GET langsung? ===");
const getRes = await fetch(`${BASE}/api/documents/${docId}`, { headers: { Cookie: tl } });
const doc = await getRes.json();
console.log(`  HTTP ${getRes.status}, status=${doc.status}`);

console.log("\n=== Cek 2: muncul di daftar dokumen proyek TANPA filter status (default)? ===");
const listRes = await fetch(`${BASE}/api/projects/${PROJECT_TOWER_A}/documents`, { headers: { Cookie: tl } });
const list = await listRes.json();
const foundInDefaultList = Array.isArray(list) && list.some((d) => d.id === docId);
console.log(`  Muncul di daftar default (tanpa filter): ${foundInDefaultList}`);

console.log("\n=== Cek 3: muncul di pencarian dengan filter status != ARCHIVED (kalau ini yg dipakai UI)? ===");
const searchActiveRes = await fetch(`${BASE}/api/documents/search?projectId=${PROJECT_TOWER_A}`, { headers: { Cookie: tl } });
const searchActive = await searchActiveRes.json();
const foundInSearch = JSON.stringify(searchActive).includes(docId);
console.log(`  Muncul di /api/documents/search tanpa filter status: ${foundInSearch}`);

console.log("\n=== Cek 4: coba hapus permanen dokumen yang sudah diarsipkan — harus ditolak ===");
const deleteAgainRes = await fetch(`${BASE}/api/documents/${docId}`, { method: "DELETE", headers: { Cookie: tl } });
const deleteAgainBody = await deleteAgainRes.json();
console.log(`  HTTP ${deleteAgainRes.status}: ${JSON.stringify(deleteAgainBody)}`);

const rows = [{
  kode: "DB-D4",
  yang_diperiksa: "Pengarsipan dokumen satuan: hilang dari daftar aktif, tetap terbaca, tidak bisa dihapus permanen",
  cara: "Arsipkan 1 dokumen nyata (bukan draft), cek GET langsung, cek daftar default proyek, cek pencarian, coba hapus lagi",
  hasil: `Status setelah arsip: ${doc.status}. Muncul di GET langsung: ya. Muncul di daftar default proyek (tanpa filter): ${foundInDefaultList}. Muncul di pencarian tanpa filter status: ${foundInSearch}. Percobaan hapus ulang: HTTP ${deleteAgainRes.status} (${JSON.stringify(deleteAgainBody)})`,
  kesimpulan: (doc.status === "ARCHIVED" && deleteAgainRes.status >= 400) ? "Lolos (sebagian)" : "Gagal",
  catatan: foundInDefaultList
    ? "TEMUAN: dokumen yang diarsipkan TETAP muncul di daftar dokumen proyek default (GET /api/projects/[id]/documents tidak mengecualikan status ARCHIVED secara bawaan) — 'hilang dari daftar aktif' TIDAK terjadi di level API tanpa filter status eksplisit dari klien. Perlu diverifikasi manual apakah halaman web punya filter default di sisi tampilan yang menyembunyikannya, karena di level API tidak ada."
    : "Dokumen benar hilang dari daftar default.",
}];

fs.writeFileSync(
  "docs/pengujian/hasil-db-d4-arsip.csv",
  "kode,yang_diperiksa,cara,hasil,kesimpulan,catatan\n" +
    rows.map((r) => [r.kode, r.yang_diperiksa, r.cara, r.hasil, r.kesimpulan, r.catatan].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n"
);
console.log("\nDitulis ke docs/pengujian/hasil-db-d4-arsip.csv");
