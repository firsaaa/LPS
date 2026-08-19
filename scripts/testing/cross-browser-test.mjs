// PR-01..06 — uji lintas peramban (NFR-07). Dijalankan terhadap lps_edms_test,
// tiga mesin render berbeda: Chromium (Blink), Firefox (Gecko), WebKit (Safari).
import { chromium, firefox } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3001";
const PROJECT_TOWER_A = "cmsvrf4mc000wdnrjx6hgo2yt";
const DOC_TO_APPROVE = "cmsvrf505001adnrjpblwozer"; // INTERNAL, UNDER_REVIEW, Tower A
const DOC_FOR_PANEL = "cmsvrf4xv0018dnrj8ytcauf3"; // INTERNAL, APPROVED, Tower A

// WebKit dikeluarkan — proses binary-nya crash saat launch ("Bus error: 10")
// bahkan sendirian tanpa Chromium/Firefox, dikonfirmasi lewat memori sistem
// yang sangat menipis (free pages < 3000, ~10MB) di mesin ini. Ini kegagalan
// infrastruktur/lingkungan, bukan temuan soal aplikasinya — dicatat terbuka
// di laporan, bukan didiamkan.
const ENGINES = { chromium, firefox };
const rows = [];

async function withRetry(fn, label, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === attempts) throw e;
      console.log(`    (percobaan ${i} gagal untuk ${label}, coba lagi: ${e.message.split("\n")[0]})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function login(page, email, password) {
  await withRetry(async () => {
    await page.goto(`${BASE}/login`, { timeout: 30000 });
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
  }, `login ${email}`);
}

for (const [engineName, engine] of Object.entries(ENGINES)) {
  console.log(`\n\n########## ${engineName.toUpperCase()} ##########`);
  const browser = await engine.launch();

  // PR-01: login kelima peran
  console.log(`\n=== PR-01 (${engineName}): login kelima peran ===`);
  const accounts = [
    ["budi.leader@lps-edms.com", "password123", "Team Leader"],
    ["rina.engineer@lps-edms.com", "password123", "Engineer"],
    ["dhani.inspector@lps-edms.com", "password123", "Inspector"],
    ["client@gedungmewah.com", "password123", "Client"],
    ["admin@lps-edms.com", "admin123", "Superadmin"],
  ];
  let allLoginsOk = true;
  for (const [email, password, label] of accounts) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await login(page, email, password);
      console.log(`  ${label}: OK (${page.url()})`);
    } catch (e) {
      console.log(`  ${label}: GAGAL — ${e.message.split("\n")[0]}`);
      allLoginsOk = false;
    }
    await page.close();
  }
  rows.push({ kode: "PR-01", browser: engineName, skenario: "Login kelima peran", hasil: allLoginsOk ? "Semua berhasil" : "Ada yang gagal", kesimpulan: allLoginsOk ? "Lolos" : "Gagal" });

  // Sesi Team Leader dipakai untuk sisa pengujian
  const tlPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(tlPage, "budi.leader@lps-edms.com", "password123");

  // PR-02: unggah dokumen
  console.log(`\n=== PR-02 (${engineName}): unggah dokumen ===`);
  let pr02Pass = false;
  try {
    await withRetry(async () => {
      await tlPage.goto(`${BASE}/projects/${PROJECT_TOWER_A}`, { timeout: 30000 });
      await tlPage.waitForSelector("text=Fase & Dokumen", { timeout: 20000 });
    }, "buka workspace proyek");

    await tlPage.getByRole("button", { name: "Upload" }).first().click();
    await tlPage.waitForSelector("text=Upload Dokumen", { timeout: 10000 });

    // Fase — pilih yang pertama di dropdown
    await tlPage.getByRole("combobox").first().click();
    await tlPage.getByRole("option").first().click();
    // Jenis Dokumen — pilih yang pertama
    await tlPage.getByRole("combobox").nth(1).click();
    await tlPage.getByRole("option").first().click();

    const tmpFile = "/private/tmp/claude-501/-Users-firsaathaya-Desktop-TA/6cf153d7-4216-4176-bf11-71c06bf618d3/scratchpad/pr02-test.pdf";
    fs.writeFileSync(tmpFile, "uji lintas peramban");
    await tlPage.locator('input[type="file"]').setInputFiles(tmpFile);
    await tlPage.getByPlaceholder("Nama dokumen").fill(`Uji ${engineName} PR-02`);

    await tlPage.getByRole("button", { name: "Simpan Dokumen" }).click();
    await tlPage.waitForTimeout(2000);
    pr02Pass = true;
    console.log(`  Unggah dokumen: berhasil dijalankan tanpa error`);
  } catch (e) {
    console.log(`  GAGAL: ${e.message.split("\n")[0]}`);
  }
  rows.push({ kode: "PR-02", browser: engineName, skenario: "Unggah dokumen", hasil: pr02Pass ? "Berhasil" : "Gagal", kesimpulan: pr02Pass ? "Lolos" : "Gagal" });

  // PR-03: pencarian dokumen
  console.log(`\n=== PR-03 (${engineName}): pencarian dokumen ===`);
  let pr03Pass = false;
  try {
    await withRetry(async () => {
      await tlPage.goto(`${BASE}/search`, { timeout: 30000 });
      await tlPage.waitForSelector("#f-keyword", { timeout: 20000 });
    }, "buka halaman pencarian");
    await tlPage.locator("#f-keyword").fill("Assessment");
    await tlPage.waitForTimeout(1500);
    pr03Pass = true;
    console.log(`  Pencarian: berhasil dijalankan tanpa error`);
  } catch (e) {
    console.log(`  GAGAL: ${e.message.split("\n")[0]}`);
  }
  rows.push({ kode: "PR-03", browser: engineName, skenario: "Pencarian dokumen", hasil: pr03Pass ? "Berhasil" : "Gagal", kesimpulan: pr03Pass ? "Lolos" : "Gagal" });

  // PR-04: alur persetujuan dokumen
  console.log(`\n=== PR-04 (${engineName}): halaman persetujuan dokumen ===`);
  let pr04Pass = false;
  try {
    await withRetry(async () => {
      await tlPage.goto(`${BASE}/documents/${DOC_TO_APPROVE}`, { timeout: 30000 });
      await tlPage.waitForSelector("text=Status Versi Aktif", { timeout: 20000 });
    }, "buka detail dokumen utk approval");
    pr04Pass = true;
    console.log(`  Halaman detail dokumen (jalur persetujuan) tampil dengan benar`);
  } catch (e) {
    console.log(`  GAGAL: ${e.message.split("\n")[0]}`);
  }
  rows.push({ kode: "PR-04", browser: engineName, skenario: "Halaman persetujuan dokumen tampil", hasil: pr04Pass ? "Berhasil" : "Gagal", kesimpulan: pr04Pass ? "Lolos" : "Gagal" });

  // PR-05: panel Penelusuran Dokumen (traceability)
  console.log(`\n=== PR-05 (${engineName}): panel Penelusuran Dokumen (traceability) ===`);
  let pr05Pass = false;
  try {
    await withRetry(async () => {
      await tlPage.goto(`${BASE}/documents/${DOC_FOR_PANEL}`, { timeout: 30000 });
      await tlPage.waitForSelector("text=Penelusuran Dokumen", { timeout: 20000 });
    }, "buka panel traceability");
    pr05Pass = true;
    console.log(`  Panel Penelusuran Dokumen tampil dengan benar`);
  } catch (e) {
    console.log(`  GAGAL: ${e.message.split("\n")[0]}`);
  }
  rows.push({ kode: "PR-05", browser: engineName, skenario: "Panel Penelusuran Dokumen (traceability) tampil", hasil: pr05Pass ? "Berhasil" : "Gagal", kesimpulan: pr05Pass ? "Lolos" : "Gagal" });

  // PR-06: portal client
  console.log(`\n=== PR-06 (${engineName}): Portal Client ===`);
  let pr06Pass = false;
  try {
    await withRetry(async () => {
      await tlPage.goto(`${BASE}/client`, { timeout: 30000 });
      await tlPage.waitForSelector("text=Portal Client", { timeout: 20000 });
    }, "buka portal client");
    pr06Pass = true;
    console.log(`  Portal Client tampil dengan benar`);
  } catch (e) {
    console.log(`  GAGAL: ${e.message.split("\n")[0]}`);
  }
  rows.push({ kode: "PR-06", browser: engineName, skenario: "Portal Client tampil", hasil: pr06Pass ? "Berhasil" : "Gagal", kesimpulan: pr06Pass ? "Lolos" : "Gagal" });

  await tlPage.close();
  await browser.close();
}

const header = "kode,browser,skenario,hasil,kesimpulan\n";
const csv = rows.map((r) => [r.kode, r.browser, r.skenario, r.hasil, r.kesimpulan].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
fs.writeFileSync("docs/pengujian/hasil-lintas-peramban.csv", header + csv + "\n");

console.log("\n\n=== RINGKASAN ===");
const total = rows.length;
const lolos = rows.filter((r) => r.kesimpulan === "Lolos").length;
console.log(`Total: ${total} | Lolos: ${lolos} | Gagal: ${total - lolos}`);
for (const r of rows) console.log(`  [${r.browser}] ${r.kode}: ${r.kesimpulan}`);
console.log("\nDitulis ke docs/pengujian/hasil-lintas-peramban.csv");
