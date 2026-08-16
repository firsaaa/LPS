// Prompt 3 TAHAP 3 — Deteksi N+1 lewat log query Prisma (PRISMA_QUERY_LOG=1 di server).
// Jalankan setelah perf-seed.mjs <tingkat>, terhadap server yang SAMA (tidak perlu restart).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";

const BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
const LOG_PATH = process.argv[3];
const OUT_CSV = "docs/pengujian/hasil-performa-n-plus-1.csv";

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

function lineCount() {
  if (!fs.existsSync(LOG_PATH)) return 0;
  const content = fs.readFileSync(LOG_PATH, "utf8");
  return content.split("\n").filter((l) => l.startsWith("prisma:query")).length;
}

async function countQueries(cookie, path) {
  const before = lineCount();
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  await res.arrayBuffer();
  await new Promise((r) => setTimeout(r, 300)); // beri waktu log flush ke file
  const after = lineCount();
  return { count: after - before, status: res.status };
}

async function main() {
  const tier = process.argv[2];
  if (!tier || !LOG_PATH) { console.error("Pakai: node perf-n-plus-one.mjs <tingkat> <path-log-server>"); process.exit(1); }

  const project = await prisma.project.findFirst({ where: { name: { startsWith: "PERF-" } }, orderBy: { createdAt: "asc" } });
  const doc = await prisma.document.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
  const docCount = await prisma.document.count({ where: { title: { startsWith: "PERF-" } } });
  const projectCount = await prisma.project.count({ where: { name: { startsWith: "PERF-" } } });
  const docsInProject = await prisma.document.count({ where: { projectId: project.id } });
  await prisma.$disconnect();

  console.log(`Tingkat "${tier}": ${projectCount} proyek total, ${docCount} dokumen total, ${docsInProject} dokumen di proyek uji.`);
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
    await countQueries(cookie, ep.path); // 1x pemanasan, dibuang (dapat kena cache Next.js RSC/route)
    const result = await countQueries(cookie, ep.path);
    console.log(`${ep.kode} ${ep.nama}: ${result.count} query SQL (HTTP ${result.status})`);
    rows.push({ tier, docCount, projectCount, docsInProject, ...ep, ...result });
  }

  const header = "tingkat,kode,nama_endpoint,jumlah_proyek,jumlah_dokumen_total,jumlah_dokumen_proyek_uji,jumlah_query_sql\n";
  const lines = rows.map((r) => [r.tier, r.kode, `"${r.nama}"`, r.projectCount, r.docCount, r.docsInProject, r.count].join(","));
  const exists = fs.existsSync(OUT_CSV);
  fs.appendFileSync(OUT_CSV, (exists ? "" : header) + lines.join("\n") + "\n");
  console.log(`\nDitulis ke ${OUT_CSV}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
