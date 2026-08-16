// Prompt 3 TAHAP 6 — Waktu unggah + memori proses server untuk berkas besar (5/50/150MB).
// Server target diberi lewat argumen PID (proses next-server yang sesungguhnya menerima upload).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
const SCRATCH = process.env.SCRATCH_DIR;
const OUT_CSV = "docs/pengujian/hasil-performa-unggah.csv";

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

function rssKB(pid) {
  try { return parseInt(execSync(`ps -o rss= -p ${pid}`).toString().trim(), 10); } catch { return null; }
}

function genFile(filePath, sizeBytes) {
  const CHUNK = 1024 * 1024;
  const fd = fs.openSync(filePath, "w");
  const buf = Buffer.alloc(CHUNK, "PERF-UPLOAD-TEST-PADDING-BYTE ");
  let written = 0;
  while (written < sizeBytes) {
    const n = Math.min(CHUNK, sizeBytes - written);
    fs.writeSync(fd, buf, 0, n);
    written += n;
  }
  fs.closeSync(fd);
}

async function main() {
  const pid = process.argv[2];
  if (!pid) { console.error("Pakai: node perf-upload.mjs <PID-server>"); process.exit(1); }

  const project = await prisma.project.findFirst({ where: { name: { startsWith: "PERF-" } }, orderBy: { createdAt: "asc" } });
  const phase = await prisma.projectPhase.findFirst({ where: { projectId: project.id, phase: "DESIGN" } });
  const docType = await prisma.documentTypeMaster.findFirst({ where: { typeCode: "DOC" } });
  await prisma.$disconnect();

  // Superadmin is deliberately forbidden from uploading (RI-25 fix) — the
  // first perf-seed user is Team Leader on "PERF-Proyek 1" specifically.
  const cookie = await login("perf-user-1@lps-edms-test.com", "password123");

  const sizes = [
    { label: "5MB", bytes: 5 * 1024 * 1024 },
    { label: "50MB", bytes: 50 * 1024 * 1024 },
    { label: "150MB", bytes: 150 * 1024 * 1024 },
  ];

  const rows = [];
  for (const s of sizes) {
    const filePath = path.join(SCRATCH, `perf-upload-${s.label}.pdf`);
    console.log(`Membuat berkas dummy ${s.label}...`);
    genFile(filePath, s.bytes);

    // Sampler RSS server tiap 150ms selama upload berjalan
    const samples = [];
    const baseline = rssKB(pid);
    let sampling = true;
    const samplerPromise = (async () => {
      while (sampling) {
        const v = rssKB(pid);
        if (v !== null) samples.push(v);
        await new Promise((r) => setTimeout(r, 150));
      }
    })();

    const fileBuf = fs.readFileSync(filePath);
    const form = new FormData();
    form.append("phase", "DESIGN");
    form.append("documentTypeId", docType.id);
    form.append("title", `PERF-Upload Test ${s.label}`);
    form.append("description", "Uji waktu unggah dan memori server (Prompt 3f)");
    form.append("visibility", "INTERNAL");
    form.append("file", new Blob([fileBuf]), `perf-upload-${s.label}.pdf`);

    console.log(`Mengunggah ${s.label}...`);
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/projects/${project.id}/documents`, {
      method: "POST", headers: { Cookie: cookie }, body: form,
    });
    const bodyText = await res.text();
    const dt = performance.now() - t0;

    sampling = false;
    await samplerPromise;

    const peak = samples.length ? Math.max(...samples) : null;
    const deltaMB = peak && baseline ? ((peak - baseline) / 1024).toFixed(1) : "n/a";
    console.log(`  -> HTTP ${res.status} dalam ${(dt / 1000).toFixed(2)}s | RSS server: awal=${(baseline / 1024).toFixed(1)}MB puncak=${peak ? (peak / 1024).toFixed(1) : "?"}MB (naik ${deltaMB}MB) | sampel=${samples.length}`);
    if (res.status >= 300) console.log(`  ! Respons: ${bodyText.slice(0, 300)}`);

    rows.push({ label: s.label, sizeBytes: s.bytes, status: res.status, seconds: (dt / 1000).toFixed(2), baselineMB: (baseline / 1024).toFixed(1), peakMB: peak ? (peak / 1024).toFixed(1) : "", deltaMB, samples: samples.length });
    fs.unlinkSync(filePath);
  }

  const header = "ukuran,ukuran_bytes,status_http,waktu_detik,rss_awal_mb,rss_puncak_mb,rss_naik_mb,jumlah_sampel\n";
  const lines = rows.map((r) => [r.label, r.sizeBytes, r.status, r.seconds, r.baselineMB, r.peakMB, r.deltaMB, r.samples].join(","));
  fs.writeFileSync(OUT_CSV, header + lines.join("\n") + "\n");
  console.log(`\nDitulis ke ${OUT_CSV}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
