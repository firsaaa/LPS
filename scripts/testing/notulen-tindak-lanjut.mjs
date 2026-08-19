// FN-01..04 + RI-28 — pengujian fungsional notulen & tindak lanjut (FR-10),
// belum pernah diuji sebelumnya. Dijalankan terhadap lps_edms_test.
import "dotenv/config";
import fs from "node:fs";

const BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
const PROJECT_TOWER_A = "cmsvrf4mc000wdnrjx6hgo2yt";
const PROJECT_MALL_CENTRAL = "cmsvrf7g2003bdnrjpznmb1eb"; // Rina bukan anggota
const USER_RINA = "cmsvrf3w1000sdnrjkhslq45d"; // Engineer, Tower A
const DOC_TYPE_DOC = "cmsvrf2kv000ddnrjgmd2owtm"; // "DOC" — Dokumen Umum

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

const rows = [];
function record(kode, skenario, ekspektasi, hasilAktual, catatan) {
  const lolos = hasilAktual.pass;
  console.log(`${kode}: ${lolos ? "LOLOS" : "GAGAL"} — ${hasilAktual.detail}`);
  rows.push({ kode, skenario, ekspektasi, hasil_aktual: hasilAktual.detail, kesimpulan: lolos ? "Lolos" : "Gagal", catatan: catatan ?? "" });
}

const tl = await login(process.env.TEST_TEAM_LEADER_EMAIL, process.env.TEST_TEAM_LEADER_PASSWORD);
const eng = await login(process.env.TEST_ENGINEER_EMAIL, process.env.TEST_ENGINEER_PASSWORD);

// ─── FN-01 ────────────────────────────────────────────────────────────────
console.log("\n=== FN-01: TL buat notulen + tindak lanjut minta jenis dokumen DOC, ditugaskan ke Rina ===");
const notulenRes = await fetch(`${BASE}/api/projects/${PROJECT_TOWER_A}/notulen`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: tl },
  body: JSON.stringify({
    title: "Rapat Uji FN-01", meetingDate: new Date().toISOString(), meetingType: "Progress",
    discussion: "Notulen uji otomatis untuk FN-01..04",
    actionItems: [{ description: "Unggah dokumen uji FN-02", assignedToId: USER_RINA, requiredDocumentTypeId: DOC_TYPE_DOC }],
  }),
});
const notulen = await notulenRes.json();
const notulenId = notulen.id;
const actionItemId = notulen.actionItems?.[0]?.id;
console.log(`  Notulen dibuat: HTTP ${notulenRes.status}, notulenId=${notulenId}, actionItemId=${actionItemId}`);

const tasksRes = await fetch(`${BASE}/api/me/tasks`, { headers: { Cookie: eng } });
const tasks = await tasksRes.json();
const foundTask = (tasks.openActionItems ?? tasks.actionItems ?? []).some?.((t) => t.id === actionItemId)
  ?? JSON.stringify(tasks).includes(actionItemId);
record(
  "FN-01", "TL buat notulen + tindak lanjut minta jenis dokumen X, ditugaskan ke Engineer",
  "Muncul sebagai tugas terbuka di /api/me/tasks milik penanggung jawab",
  { pass: notulenRes.status === 201 && !!actionItemId && foundTask, detail: `notulen HTTP ${notulenRes.status}, actionItemId ${actionItemId ? "ada" : "TIDAK ADA"}, muncul di /api/me/tasks Engineer: ${foundTask}` }
);

// ─── FN-02 ────────────────────────────────────────────────────────────────
console.log("\n=== FN-02: Engineer unggah dokumen jenis DOC, lalu tutup tindak lanjut dengan dokumen itu sebagai bukti ===");
const uploadForm = new FormData();
uploadForm.append("phase", "INISIASI");
uploadForm.append("documentTypeId", DOC_TYPE_DOC);
uploadForm.append("title", "Dokumen Bukti FN-02");
uploadForm.append("visibility", "INTERNAL");
uploadForm.append("file", new Blob([Buffer.from("bukti fn-02")]), "bukti-fn02.pdf");
const uploadRes = await fetch(`${BASE}/api/projects/${PROJECT_TOWER_A}/documents`, { method: "POST", headers: { Cookie: eng }, body: uploadForm });
const uploaded = await uploadRes.json();
const evidenceDocId = uploaded.document?.id ?? uploaded.id;
console.log(`  Dokumen bukti diunggah: HTTP ${uploadRes.status}, docId=${evidenceDocId}`);

const closeRes = await fetch(`${BASE}/api/notulen/${notulenId}/action-items/${actionItemId}/close`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: eng },
  body: JSON.stringify({ linkedDocumentId: evidenceDocId, closedNote: "Selesai, lihat dokumen terlampir" }),
});
const closed = await closeRes.json();
const closedOk = closed.status === "CLOSED" && closed.linkedDocument?.id === evidenceDocId;
record(
  "FN-02", "Engineer unggah dokumen jenis X, tutup tindak lanjut dengan dokumen itu sebagai bukti",
  "Tindak lanjut tertutup, dokumen bukti tertaut",
  { pass: closeRes.status === 200 && closedOk, detail: `HTTP ${closeRes.status}, status=${closed.status}, linkedDocument=${closed.linkedDocument?.id ?? "tidak ada"}` }
);

// ─── FN-03 / RI-28 ──────────────────────────────────────────────────────────
console.log("\n=== FN-03/RI-28: Engineer (bukan anggota Mall Central) coba buat notulen di sana ===");
const foreignRes = await fetch(`${BASE}/api/projects/${PROJECT_MALL_CENTRAL}/notulen`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: eng },
  body: JSON.stringify({ title: "Notulen Tidak Sah", meetingDate: new Date().toISOString(), actionItems: [] }),
});
record(
  "RI-28", "Engineer proyek lain coba buat notulen di proyek yang bukan miliknya",
  "HTTP 403",
  { pass: foreignRes.status === 403, detail: `HTTP ${foreignRes.status}` }
);

// ─── FN-04 ────────────────────────────────────────────────────────────────
console.log("\n=== FN-04: Tutup tindak lanjut TANPA dokumen bukti ===");
const notulen2Res = await fetch(`${BASE}/api/projects/${PROJECT_TOWER_A}/notulen`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: tl },
  body: JSON.stringify({
    title: "Rapat Uji FN-04", meetingDate: new Date().toISOString(),
    actionItems: [{ description: "Tindak lanjut uji FN-04 tanpa bukti", assignedToId: USER_RINA }],
  }),
});
const notulen2 = await notulen2Res.json();
const item2Id = notulen2.actionItems?.[0]?.id;
const closeNoEvidenceRes = await fetch(`${BASE}/api/notulen/${notulen2.id}/action-items/${item2Id}/close`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: eng },
  body: JSON.stringify({}),
});
const closedNoEvidence = await closeNoEvidenceRes.json();
const wasRejected = closeNoEvidenceRes.status >= 400;
record(
  "FN-04", "Tutup tindak lanjut tanpa dokumen bukti",
  "Ditolak",
  { pass: wasRejected, detail: `HTTP ${closeNoEvidenceRes.status}, status tersimpan=${closedNoEvidence.status ?? "n/a"}` },
  wasRejected ? "" : "TEMUAN: toggleActionItem() di notulen.service.ts tidak memvalidasi keberadaan linkedDocumentId sama sekali sebelum menutup — item berhasil ditutup tanpa bukti apa pun. Bukan bug skrip pengujian; ini perilaku nyata sistem, dikonfirmasi lewat pembacaan kode (baris 188-224) sebelum diuji."
);

fs.writeFileSync(
  "docs/pengujian/hasil-notulen-tindak-lanjut.csv",
  "kode,skenario,ekspektasi,hasil_aktual,kesimpulan,catatan\n" +
    rows.map((r) => [r.kode, r.skenario, r.ekspektasi, r.hasil_aktual, r.kesimpulan, r.catatan].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n"
);
const lolos = rows.filter((r) => r.kesimpulan === "Lolos").length;
console.log(`\nTotal: ${rows.length} | Lolos: ${lolos} | Gagal: ${rows.length - lolos}`);
console.log("Ditulis ke docs/pengujian/hasil-notulen-tindak-lanjut.csv");
