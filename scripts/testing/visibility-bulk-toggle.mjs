// Verifikasi fitur baru: saklar bulk per proyek untuk visibilitas dokumen
// (Project.inspectorSeesAllDocuments / clientSeesAllDocuments).
// Dijalankan HANYA terhadap server test lokal (lps_edms_test), tidak pernah produksi.
import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PROJECT_TOWER_A = "cmsvrf4mc000wdnrjx6hgo2yt";
const DOC_INTERNAL_APPROVED = "cmsvrf4xv0018dnrj8ytcauf3"; // visibility=INTERNAL, status=APPROVED

const CRED = {
  TEAM_LEADER: { email: process.env.TEST_TEAM_LEADER_EMAIL, password: process.env.TEST_TEAM_LEADER_PASSWORD },
  INSPECTOR: { email: process.env.TEST_INSPECTOR_EMAIL, password: process.env.TEST_INSPECTOR_PASSWORD },
  CLIENT: { email: process.env.TEST_CLIENT_EMAIL, password: process.env.TEST_CLIENT_PASSWORD },
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
  const inspectorCookie = await login("INSPECTOR");
  const clientCookie = await login("CLIENT");

  // Baseline sebelum diubah apa pun (untuk dipulihkan di akhir).
  const before = await prisma.project.findUnique({ where: { id: PROJECT_TOWER_A }, select: { inspectorSeesAllDocuments: true, clientSeesAllDocuments: true } });

  // ── VIS-01: Default proyek (belum diubah) — Inspector ON, Client OFF ────────
  const vis01Pass = before.inspectorSeesAllDocuments === true && before.clientSeesAllDocuments === false;
  record("VIS-01", "Positive", "Default proyek baru: inspectorSeesAllDocuments=true, clientSeesAllDocuments=false",
    "true, false", `${before.inspectorSeesAllDocuments}, ${before.clientSeesAllDocuments}`, vis01Pass ? "PASS" : "FAIL");

  // ── VIS-02: Dengan default (Inspector ON), Inspector bisa lihat dokumen INTERNAL ──
  const vis02 = await req(inspectorCookie, "GET", `/api/documents/${DOC_INTERNAL_APPROVED}`);
  const vis02Pass = vis02.status === 200;
  record("VIS-02", "Positive", "Inspector (bulk toggle ON, default) bisa GET dokumen visibility=INTERNAL yang normalnya di luar aksesnya",
    "HTTP 200", `HTTP ${vis02.status}`, vis02Pass ? "PASS" : "FAIL");

  // ── VIS-03: Matikan toggle Inspector, harus kembali ke aturan per-dokumen (ditolak) ──
  await req(tlCookie, "PATCH", `/api/projects/${PROJECT_TOWER_A}`, { inspectorSeesAllDocuments: false });
  const vis03 = await req(inspectorCookie, "GET", `/api/documents/${DOC_INTERNAL_APPROVED}`);
  const vis03Pass = vis03.status === 403;
  record("VIS-03", "Negative", "Setelah toggle Inspector dimatikan, Inspector kembali ditolak dari dokumen INTERNAL (kembali ke aturan per-dokumen)",
    "HTTP 403", `HTTP ${vis03.status}`, vis03Pass ? "PASS" : "FAIL");

  // ── VIS-04: Client default (OFF) tidak bisa lihat dokumen INTERNAL ──────────
  const vis04 = await req(clientCookie, "GET", `/api/documents/${DOC_INTERNAL_APPROVED}`);
  const vis04Pass = vis04.status === 403;
  record("VIS-04", "Positive", "Client (bulk toggle OFF, default) tidak bisa GET dokumen visibility=INTERNAL — harus di-custom satu-satu seperti biasa",
    "HTTP 403", `HTTP ${vis04.status}`, vis04Pass ? "PASS" : "FAIL");

  // ── VIS-05: Nyalakan toggle Client, Client sekarang bisa lihat dokumen INTERNAL ──
  await req(tlCookie, "PATCH", `/api/projects/${PROJECT_TOWER_A}`, { clientSeesAllDocuments: true });
  const vis05 = await req(clientCookie, "GET", `/api/documents/${DOC_INTERNAL_APPROVED}`);
  const vis05Pass = vis05.status === 200;
  record("VIS-05", "Positive", "Setelah toggle Client dinyalakan, Client bisa GET dokumen visibility=INTERNAL (APPROVED — gate status tetap terpisah)",
    "HTTP 200", `HTTP ${vis05.status}`, vis05Pass ? "PASS" : "FAIL");

  // ── VIS-06: Gate APPROVED-only untuk Client TETAP berlaku meski toggle ON (tidak ikut di-bypass) ──
  // Butuh dokumen INTERNAL yang BUKAN APPROVED untuk membuktikan gate status terpisah tetap aktif.
  const nonApprovedDoc = await prisma.document.findFirst({
    where: { projectId: PROJECT_TOWER_A, visibility: "INTERNAL", status: { not: "APPROVED" } },
    select: { id: true, status: true },
  });
  let vis06Pass = null, vis06Actual = "Tidak ada dokumen INTERNAL non-APPROVED di Tower A untuk diuji — dilewati";
  if (nonApprovedDoc) {
    const vis06 = await req(clientCookie, "GET", `/api/documents/${nonApprovedDoc.id}`);
    vis06Pass = vis06.status === 403;
    vis06Actual = `Dokumen status=${nonApprovedDoc.status}, HTTP ${vis06.status}`;
  }
  record("VIS-06", "Negative", "Toggle Client ON hanya melewati gate VISIBILITAS, TIDAK melewati gate APPROVED-only (dokumen belum APPROVED tetap ditolak)",
    "HTTP 403 untuk dokumen INTERNAL yang belum APPROVED", vis06Actual, vis06Pass === null ? "DILEWATI" : vis06Pass ? "PASS" : "FAIL");

  // Pulihkan ke default asli Tower A.
  await req(tlCookie, "PATCH", `/api/projects/${PROJECT_TOWER_A}`, { inspectorSeesAllDocuments: before.inspectorSeesAllDocuments, clientSeesAllDocuments: before.clientSeesAllDocuments });
  const restored = await prisma.project.findUnique({ where: { id: PROJECT_TOWER_A }, select: { inspectorSeesAllDocuments: true, clientSeesAllDocuments: true } });
  console.log(`(Dipulihkan ke: inspectorSeesAllDocuments=${restored.inspectorSeesAllDocuments}, clientSeesAllDocuments=${restored.clientSeesAllDocuments})`);

  const summary = {
    dijalankan: new Date().toISOString(),
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    hasil: results,
    temuan: [],
  };
  writeFileSync("docs/pengujian/hasil-visibility-bulk-toggle.json", JSON.stringify(summary, null, 2) + "\n");
  console.log(`\n=== RINGKASAN: ${summary.pass}/${summary.total} PASS ===`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
