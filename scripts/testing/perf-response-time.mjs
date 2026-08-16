// Prompt 3 TAHAP 2 — Pengukuran waktu respons per endpoint, per tingkat data.
// Jalankan SETELAH perf-seed.mjs <tingkat> pada database yang sama.
// 10 kali percobaan per endpoint, percobaan pertama dibuang (warm-up), lapor median + p95.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";

const BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
const OUT_CSV = "docs/pengujian/hasil-performa-waktu-respons.csv";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function timeEndpoint(cookie, path, runs = 10) {
  const durations = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    await res.arrayBuffer();
    const dt = performance.now() - t0;
    if (!res.ok) { console.warn(`  ! ${path} -> HTTP ${res.status} pada percobaan ${i + 1}`); }
    durations.push(dt);
  }
  const measured = durations.slice(1); // buang percobaan pertama (warm-up)
  const sorted = [...measured].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  return { median, p95, min: sorted[0], max: sorted[sorted.length - 1], raw: durations };
}

async function main() {
  const tier = process.argv[2];
  if (!tier) { console.error("Pakai: node perf-response-time.mjs <nama-tingkat>"); process.exit(1); }

  console.log("Mengambil ID fixture PERF dari database saat ini...");
  const project = await prisma.project.findFirst({ where: { name: { startsWith: "PERF-" } }, orderBy: { createdAt: "asc" } });
  if (!project) { console.error("Tidak ada data PERF-* ditemukan — jalankan perf-seed.mjs dulu."); process.exit(1); }
  const doc = await prisma.document.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
  const docCount = await prisma.document.count({ where: { title: { startsWith: "PERF-" } } });
  const projectCount = await prisma.project.count({ where: { name: { startsWith: "PERF-" } } });
  await prisma.$disconnect();

  console.log(`Tingkat "${tier}": ${projectCount} proyek, ${docCount} dokumen. Proyek uji: ${project.name} (${project.id})`);
  console.log("Login sebagai Superadmin uji...");
  const cookie = await login(process.env.TEST_SUPERADMIN_EMAIL, process.env.TEST_SUPERADMIN_PASSWORD);

  const endpoints = [
    { kode: "PF-01", nama: "Dashboard lintas proyek", path: `/api/dashboard` },
    { kode: "PF-02", nama: "Detail proyek + ringkasan kelengkapan", path: `/api/projects/${project.id}` },
    { kode: "PF-03", nama: "Daftar dokumen proyek", path: `/api/projects/${project.id}/documents` },
    { kode: "PF-04", nama: "Pencarian judul dokumen", path: `/api/documents/search?keyword=${encodeURIComponent(doc.title)}` },
    { kode: "PF-05", nama: "Pencarian isi berkas", path: `/api/documents/search?keyword=KATAKUNCIUJIPERFORMA` },
    { kode: "PF-06", nama: "Pusat Kepatuhan (laporan agregat)", path: `/api/laporan?period=all` },
    { kode: "PF-07", nama: "Detail dokumen + riwayat versi", path: `/api/documents/${doc.id}` },
  ];

  const rows = [];
  for (const ep of endpoints) {
    process.stdout.write(`Mengukur ${ep.kode} ${ep.nama}... `);
    const result = await timeEndpoint(cookie, ep.path);
    console.log(`median=${result.median.toFixed(0)}ms p95=${result.p95.toFixed(0)}ms`);
    rows.push({ tier, ...ep, docCount, projectCount, ...result });
  }

  const header = "tingkat,kode,nama_endpoint,path,jumlah_proyek,jumlah_dokumen,median_ms,p95_ms,min_ms,max_ms\n";
  const lines = rows.map((r) =>
    [r.tier, r.kode, `"${r.nama}"`, `"${r.path}"`, r.projectCount, r.docCount, r.median.toFixed(1), r.p95.toFixed(1), r.min.toFixed(1), r.max.toFixed(1)].join(",")
  );
  const exists = fs.existsSync(OUT_CSV);
  fs.appendFileSync(OUT_CSV, (exists ? "" : header) + lines.join("\n") + "\n");
  console.log(`\nDitulis ke ${OUT_CSV} (mode tambah/append per tingkat).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
