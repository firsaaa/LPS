// Membuat 5 tautan BASED_ON NYATA di production, lewat browser sungguhan
// (bukan panggilan API langsung) — sesuai permintaan: jadi bukti fiturnya
// bisa dipakai orang, bukan cuma bisa diisi lewat basis data/skrip.
import { chromium } from "playwright";

const BASE = "https://lps-edms-web-production.up.railway.app";
const SCRATCH = "/private/tmp/claude-501/-Users-firsaathaya-Desktop-TA/6cf153d7-4216-4176-bf11-71c06bf618d3/scratchpad/traceability-screenshots";

const DOCS = {
  desain: { id: "cmsp15ox5002t2ho4qxxnu5d9", code: "LRH-DES-DES-001", title: "Dokumen Desain LPS RS Harapan Bunda" },
  assessmentRisiko: { id: "cmsp15owv002r2ho4eetegpaw", code: "LRH-ASM-RSK-001", title: "Laporan Assessment Risiko RS Harapan Bunda" },
  rollingSphere: { id: "cmsp15oxg002v2ho4w11qdkbc", code: "LRH-DES-RSF-001", title: "Perhitungan Rolling Sphere RS Harapan Bunda" },
  asBuilt: { id: "cmsp15oyu00332ho43fshctmj", code: "LRH-CMS-ABD-001", title: "As-Built Drawing RS Harapan Bunda" },
  checklist: { id: "cmsp15oz900352ho4579wvyrl", code: "LRH-CMS-CHK-001", title: "Checklist Verifikasi RS Harapan Bunda" },
  logCommissioning: { id: "cmsp15oyk00312ho4k95le22g", code: "LRH-CMS-LOG-001", title: "Log Pengujian Commissioning RS Harapan Bunda" },
  inspeksiBerkala: { id: "cmsp15ozk00372ho480ronr93", code: "LRH-INS-LIB-001", title: "Laporan Inspeksi Berkala RS Harapan Bunda" },
};

const LINKS = [
  { from: DOCS.desain, to: DOCS.assessmentRisiko, label: "Dokumen Desain -> Laporan Assessment Risiko" },
  { from: DOCS.rollingSphere, to: DOCS.desain, label: "Perhitungan Rolling Sphere -> Dokumen Desain" },
  { from: DOCS.asBuilt, to: DOCS.desain, label: "Gambar As-Built -> Dokumen Desain" },
  { from: DOCS.logCommissioning, to: DOCS.checklist, label: "Log Pengujian Commissioning -> Checklist Verifikasi" },
  { from: DOCS.inspeksiBerkala, to: DOCS.logCommissioning, label: "Laporan Inspeksi Berkala -> Log Pengujian Commissioning (kritis untuk T-02/T-12)" },
];

import { mkdirSync } from "node:fs";
mkdirSync(SCRATCH, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

console.log("Login sebagai Team Leader (budi.leader@lps-edms.com)...");
let loggedIn = false;
for (let attempt = 1; attempt <= 4 && !loggedIn; attempt++) {
  try {
    await page.goto(`${BASE}/login`, { timeout: 30000 });
    await page.fill("#email", "budi.leader@lps-edms.com");
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
    loggedIn = true;
  } catch (e) {
    console.log(`  Percobaan login ${attempt} gagal (${e.message.split("\n")[0]}), coba lagi...`);
    await page.waitForTimeout(2000);
  }
}
if (!loggedIn) throw new Error("Login gagal setelah 4 percobaan.");
console.log(`  Login OK, halaman sekarang: ${page.url()}`);

const results = [];
for (const [i, link] of LINKS.entries()) {
  console.log(`\n=== Tautan ${i + 1}/5: ${link.label} ===`);
  let loaded = false;
  for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
    try {
      await page.goto(`${BASE}/documents/${link.from.id}`, { timeout: 30000 });
      await page.waitForSelector("text=Penelusuran Dokumen", { timeout: 20000 });
      loaded = true;
    } catch (e) {
      console.log(`  Percobaan buka halaman ${attempt} gagal, coba lagi...`);
      await page.waitForTimeout(2000);
    }
  }
  if (!loaded) throw new Error(`Gagal membuka halaman dokumen ${link.from.id} setelah 3 percobaan.`);

  const addButton = page.getByRole("button", { name: /Tambah Referensi/i });
  await addButton.click();

  const select = page.getByRole("combobox").first();
  await select.click();

  await page.getByRole("option", { name: new RegExp(link.to.code) }).click();

  await page.screenshot({ path: `${SCRATCH}/link-${i + 1}-before-save.png` });

  const saveButton = page.getByRole("button", { name: "Simpan" });
  await saveButton.click();
  await page.waitForTimeout(1200); // tunggu toast + reload panel

  await page.screenshot({ path: `${SCRATCH}/link-${i + 1}-after-save.png` });

  const bodyText = await page.locator("text=Berdasarkan Dokumen").locator("..").innerText().catch(() => "");
  const success = bodyText.includes(link.to.code);
  console.log(`  ${success ? "BERHASIL" : "PERLU DICEK MANUAL"} — cek screenshot link-${i + 1}-after-save.png`);
  results.push({ link: link.label, success });
}

console.log("\n=== Ambil metrik traceability proyek (M-1, M-2) ===");
const metricsRes = await page.request.get(`${BASE}/api/projects/cmsp15ovo002g2ho4ckyjqbhy/traceability`);
const metrics = await metricsRes.json();
console.log(JSON.stringify(metrics, null, 2));

await page.screenshot({ path: `${SCRATCH}/final-state.png`, fullPage: true });
await browser.close();

console.log("\n=== Ringkasan ===");
for (const r of results) console.log(`  ${r.success ? "OK" : "CEK"} — ${r.link}`);
console.log(`\nMetrik: traceabilityCoverage=${metrics.traceabilityCoverage}%, lifecycleIntegrationLevel=${metrics.lifecycleIntegrationLevel}%`);
console.log(`Screenshot tersimpan di: ${SCRATCH}`);
