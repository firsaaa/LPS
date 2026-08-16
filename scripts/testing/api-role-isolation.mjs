// Prompt 1 — Pengujian isolasi peran lewat API (black box).
// Dijalankan HANYA terhadap server test lokal (BASE_URL), tidak pernah produksi.
import "dotenv/config";
import { writeFileSync } from "fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

const CRED = {
  SUPERADMIN: { email: process.env.TEST_SUPERADMIN_EMAIL, password: process.env.TEST_SUPERADMIN_PASSWORD },
  TEAM_LEADER: { email: process.env.TEST_TEAM_LEADER_EMAIL, password: process.env.TEST_TEAM_LEADER_PASSWORD },
  ENGINEER: { email: process.env.TEST_ENGINEER_EMAIL, password: process.env.TEST_ENGINEER_PASSWORD },
  INSPECTOR: { email: process.env.TEST_INSPECTOR_EMAIL, password: process.env.TEST_INSPECTOR_PASSWORD },
  CLIENT: { email: process.env.TEST_CLIENT_EMAIL, password: process.env.TEST_CLIENT_PASSWORD },
  LEADER2: { email: "leader2@lps-edms-test.com", password: "password123" },
};

// Fixture IDs — dikumpulkan dari lps_edms_test sebelum sesi (lihat setup-fixtures.mjs
// dan query manual). Kalau seed diulang, ID ini perlu ditarik ulang.
const F = {
  projTowerA: "cmsvrf4mc000wdnrjx6hgo2yt",
  projMallCentral: "cmsvrf7g2003bdnrjpznmb1eb", // Rina (Engineer) BUKAN anggota
  projUji2: "cmsvrk8vk0001vhrjq0qqpfkq",        // milik leader2, Budi BUKAN anggota
  userAdmin: "cmsvrf35e000pdnrjfsdzz6dw",
  userBudi: "cmsvrf3j5000rdnrj1tim8jvf",
  userRina: "cmsvrf3w1000sdnrjkhslq45d",
  docInternalApproved: "cmsvrf4xv0018dnrj8ytcauf3", // INTERNAL, APPROVED
  docUnderReview: "cmsvrf505001adnrjpblwozer",       // INTERNAL, UNDER_REVIEW
  docTypeId: "cmsvrf2kv000ddnrjgmd2owtm",
  internalFilePath: "/api/files/cmsvrf4mc000wdnrjx6hgo2yt/LGM-ASM-RSK-001-v1.pdf",
};

// Frasa yang TIDAK BOLEH muncul di body sebuah respons yang ditolak (403/404 generik) —
// kalau muncul, berarti ada metadata yang bocor sebelum otorisasi sempat menolak.
const LEAK_MARKERS = ["LPS Gedung Mewah Tower A", "LPS Gedung Parkir Mall Central", "Laporan Assessment Risiko"];

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
  let text = "";
  try { text = await res.text(); } catch { /* ignore */ }
  return { status, text };
}

async function reqMultipart(cookie, method, path, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) fd.append(k, v, "test.pdf");
    else fd.append(k, v);
  }
  const opts = { method, headers: {}, body: fd, redirect: "manual" };
  if (cookie) opts.headers.Cookie = cookie;
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const status = res.status;
  let text = "";
  try { text = await res.text(); } catch { /* ignore */ }
  return { status, text };
}

function leakCheck(text) {
  return LEAK_MARKERS.some((m) => text.includes(m));
}

async function main() {
  console.log("Login sebagai kelima peran + akun bantu...");
  const cookies = {};
  for (const role of Object.keys(CRED)) {
    cookies[role] = await login(role);
  }

  const results = [];
  let seq = 0;
  const code = () => `RI-${String(++seq).padStart(2, "0")}`;

  async function run(role, method, path, opts = {}) {
    const { body, multipart, expected, desc, checkLeakOn403 = true } = opts;
    const cookie = role === "NONE" ? null : cookies[role];
    const r = multipart
      ? await reqMultipart(cookie, method, path, multipart)
      : await req(cookie, method, path, body);
    const isBlocked = [401, 403, 404].includes(r.status);
    const leaked = checkLeakOn403 && isBlocked && leakCheck(r.text);
    const pass = expected.includes(r.status) && !leaked;
    results.push({
      kode: code(), peran: role, method, endpoint: path,
      ekspektasi: expected.join("|"), kode_respons_aktual: r.status,
      ada_kebocoran_data: leaked ? "YA" : "tidak",
      kesimpulan: pass ? "Lolos" : "Gagal",
      catatan: desc,
    });
    return r;
  }

  // ── Tanpa sesi ──────────────────────────────────────────────────────────
  await run("NONE", "GET", "/api/projects", { expected: [401], desc: "TEMUAN: src/proxy.ts me-redirect (307) SEMUA path tanpa sesi ke /login, termasuk /api/*, sebelum sempat mencapai unauthorized() di route handler. Menyalahi NFR-01 sendiri (\"API dibalas 401\"). Klien API non-browser yang tidak mengikuti redirect akan menerima 307 dengan body kosong, bukan pesan error yang bisa dipakai." });
  await run("NONE", "GET", `/api/documents/${F.docInternalApproved}`, { expected: [401], desc: "Sama seperti RI-01 — pola sistemik di proxy.ts, bukan khusus endpoint ini" });
  await run("NONE", "GET", F.internalFilePath, { expected: [401], desc: "Sama seperti RI-01 — pola sistemik di proxy.ts, bukan khusus endpoint ini" });

  // ── ENGINEER (Rina) ─────────────────────────────────────────────────────
  await run("ENGINEER", "PATCH", `/api/projects/${F.projTowerA}`, { body: { name: "Diubah Paksa" }, expected: [403], desc: "Engineer tidak boleh ubah metadata proyek" });
  await run("ENGINEER", "POST", "/api/projects", { body: { name: "Proyek Ilegal", client: "X" }, expected: [403], desc: "Aksi tetap ditolak (benar), tapi lewat badRequest() → 400, bukan forbidden() → 403 seperti pemeriksaan kewenangan lain di sistem ini. Tidak ada kebocoran data, murni ketidakkonsistenan kode status HTTP." });
  await run("ENGINEER", "GET", "/api/users", { expected: [200], checkLeakOn403: false, desc: "DISENGAJA terbuka untuk semua user login sejak perbaikan dropdown Tambah Anggota (lihat catatan) — bukan bug" });
  await run("ENGINEER", "GET", "/api/audit-logs", { expected: [403, 200], desc: "Perlu diverifikasi: audit log per-proyek atau global? Kalau global tanpa filter, cek apakah Engineer melihat proyek yang tidak diikuti" });
  await run("ENGINEER", "GET", `/api/projects/${F.projMallCentral}`, { expected: [403, 404], desc: "Rina bukan anggota Mall Central" });
  await run("ENGINEER", "POST", `/api/documents/${F.docUnderReview}/approve`, { body: { action: "approve" }, expected: [403], desc: "Engineer tidak boleh approve" });
  await run("ENGINEER", "POST", `/api/projects/${F.projTowerA}/members`, { body: { userId: F.userAdmin, role: "ENGINEER" }, expected: [403], desc: "Engineer tidak boleh kelola anggota tim" });

  // ── TEAM_LEADER (Budi) ──────────────────────────────────────────────────
  await run("TEAM_LEADER", "POST", "/api/users", { body: { name: "X", email: "x@test.com", password: "password123" }, expected: [403], desc: "Team Leader tidak boleh buat akun pengguna" });
  await run("TEAM_LEADER", "GET", `/api/projects/${F.projUji2}`, { expected: [403, 404], desc: "Budi bukan anggota proyek milik Team Leader lain (leader2)" });
  {
    const blob = new Blob(["%PDF-1.4\ntest content for RI upload\n%%EOF"], { type: "application/pdf" });
    const r = await run("TEAM_LEADER", "POST", `/api/projects/${F.projTowerA}/documents`, {
      multipart: { phase: "DESIGN", documentTypeId: F.docTypeId, title: "RI Upload Check TL", visibility: "INTERNAL", file: blob },
      expected: [201], desc: "Kontrol positif: TL memang boleh upload ke proyeknya sendiri",
    });
    if (r.status === 201) {
      try { results[results.length - 1]._createdDocId = JSON.parse(r.text)?.document?.id; } catch { /* ignore */ }
    }
  }

  // ── INSPECTOR (Dhani) ───────────────────────────────────────────────────
  {
    const blob = new Blob(["%PDF-1.4\ntest\n%%EOF"], { type: "application/pdf" });
    await run("INSPECTOR", "POST", `/api/projects/${F.projTowerA}/documents`, {
      multipart: { phase: "DESIGN", documentTypeId: F.docTypeId, title: "RI Upload Illegal", visibility: "INTERNAL", file: blob },
      expected: [403], desc: "Inspector bukan bagian tim proyek, tidak boleh upload",
    });
  }
  await run("INSPECTOR", "POST", "/api/projects", { body: { name: "Proyek Ilegal Inspector", client: "X" }, expected: [403], desc: "Sama seperti RI-05 — 400 bukan 403, tapi aksinya tetap tertolak" });
  await run("INSPECTOR", "PATCH", `/api/users/${F.userBudi}`, { body: { name: "Diubah Paksa" }, expected: [403], desc: "Inspector tidak boleh ubah data user lain" });
  await run("INSPECTOR", "DELETE", `/api/documents/${F.docInternalApproved}`, { expected: [403], desc: "Inspector tidak boleh hapus/arsipkan dokumen" });
  await run("INSPECTOR", "POST", `/api/documents/${F.docUnderReview}/approve`, { body: { action: "approve" }, expected: [403], desc: "PERUBAHAN SESI INI: Inspector sengaja dicabut hak approve — cek endpoint /approve" });
  await run("INSPECTOR", "PUT", `/api/documents/${F.docUnderReview}/status`, { body: { status: "APPROVED" }, expected: [403], desc: "TEMUAN DIDUGA: endpoint /status terpisah dari /approve, komentar kodenya masih bilang TEAM_LEADER/INSPECTOR — cek apakah ini pintu belakang yang lolos dari pencabutan hak approve Inspector" });

  // ── CLIENT (Ahmad) ──────────────────────────────────────────────────────
  await run("CLIENT", "GET", `/api/documents/${F.docInternalApproved}`, { expected: [403], desc: "Dokumen visibility INTERNAL (bukan Client) tidak boleh dibuka Client" });
  await run("CLIENT", "GET", "/api/dashboard", { expected: [200], checkLeakOn403: false, desc: "Halaman boleh dibuka, tapi widget internal (pending review dkk) harus kosong — periksa isi body manual" });
  await run("CLIENT", "GET", `/api/projects/${F.projMallCentral}`, { expected: [403, 404], desc: "Ahmad bukan client di proyek lain" });
  {
    const blob = new Blob(["%PDF-1.4\ntest\n%%EOF"], { type: "application/pdf" });
    await run("CLIENT", "POST", `/api/projects/${F.projTowerA}/documents`, {
      multipart: { phase: "DESIGN", documentTypeId: F.docTypeId, title: "RI Upload Illegal Client", visibility: "INTERNAL", file: blob },
      expected: [403], desc: "Client tidak boleh upload",
    });
  }
  await run("CLIENT", "GET", F.internalFilePath, { expected: [403], desc: "Berkas mentah dokumen internal tidak boleh diunduh Client" });

  // ── SUPERADMIN ───────────────────────────────────────────────────────────
  {
    const blob = new Blob(["%PDF-1.4\ntest\n%%EOF"], { type: "application/pdf" });
    await run("SUPERADMIN", "POST", `/api/projects/${F.projTowerA}/documents`, {
      multipart: { phase: "DESIGN", documentTypeId: F.docTypeId, title: "RI Upload SA", visibility: "INTERNAL", file: blob },
      expected: [403], desc: "TEMUAN DIDUGA: route upload memakai `!user.isSuperadmin && ...`, artinya Superadmin JUSTRU DILOLOSKAN — tidak konsisten dengan /approve yang eksplisit menolak Superadmin",
    });
  }
  await run("SUPERADMIN", "POST", "/api/projects", { body: { name: "Proyek Ilegal SA", client: "X" }, expected: [403], desc: "Sama seperti RI-05 — 400 bukan 403, tapi aksinya tetap tertolak (perilaku ini sudah benar sejak awal sesi sebelumnya)" });
  await run("SUPERADMIN", "POST", `/api/documents/${F.docUnderReview}/approve`, { body: { action: "approve" }, expected: [403], desc: "Superadmin tidak boleh approve (sudah diverifikasi sebelumnya)" });

  // ── Ringkasan ────────────────────────────────────────────────────────────
  const lolos = results.filter((r) => r.kesimpulan === "Lolos").length;
  const gagal = results.length - lolos;
  console.log(`\nTotal: ${results.length} | Lolos: ${lolos} | Gagal: ${gagal}\n`);
  for (const r of results.filter((r) => r.kesimpulan === "Gagal")) {
    console.log(`GAGAL ${r.kode} [${r.peran}] ${r.method} ${r.endpoint} → dapat ${r.kode_respons_aktual}, ekspektasi ${r.ekspektasi} — ${r.catatan}`);
  }

  const header = "kode,peran,method,endpoint,ekspektasi,kode_respons_aktual,ada_kebocoran_data,kesimpulan,catatan";
  const csvEscape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [header, ...results.map((r) =>
    [r.kode, r.peran, r.method, r.endpoint, r.ekspektasi, r.kode_respons_aktual, r.ada_kebocoran_data, r.kesimpulan, r.catatan]
      .map(csvEscape).join(",")
  )];
  writeFileSync("docs/pengujian/hasil-isolasi-peran.csv", lines.join("\n") + "\n", "utf-8");
  console.log("Ditulis ke docs/pengujian/hasil-isolasi-peran.csv");
}

main().catch((e) => { console.error(e); process.exit(1); });
