// FR-08 — "Setiap proyek otomatis memiliki 6 fase tetap sesuai siklus LPS (IEC 62305)."
// Belum pernah diuji end-to-end sebelumnya (hanya diverifikasi tidak langsung lewat
// proyek yang SUDAH difase-kan di seed data). Di sini: benar-benar membuat proyek baru
// lewat API sungguhan, lalu memeriksa fase yang otomatis muncul.
// Dijalankan HANYA terhadap server test lokal (lps_edms_test), tidak pernah produksi.
import "dotenv/config";
import { writeFileSync } from "fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const CRED = { email: process.env.TEST_TEAM_LEADER_EMAIL, password: process.env.TEST_TEAM_LEADER_PASSWORD };

const EXPECTED_PHASES = ["INISIASI", "ASSESSMENT", "DESIGN", "IMPLEMENTASI", "COMMISSIONING", "INSPEKSI_BERKALA"];

async function login() {
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
    body: new URLSearchParams({ email: CRED.email, password: CRED.password, csrfToken, json: "true" }),
    redirect: "manual",
  });
  setCookies(loginRes);
  return cookieHeader();
}

async function main() {
  const cookie = await login();
  const rows = [];

  const projectName = `Uji FR-08 ${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: projectName, client: "PT Uji FR-08" }),
  });
  const created = await createRes.json();
  const projectId = created?.id ?? created?.data?.id;

  let kesimpulan = "Gagal";
  let catatan = "";

  if (createRes.status !== 201 || !projectId) {
    catatan = `Pembuatan proyek gagal (status ${createRes.status}): ${JSON.stringify(created).slice(0, 300)}`;
  } else {
    const detailRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, { headers: { Cookie: cookie } });
    const detail = await detailRes.json();
    const phases = detail?.phases ?? detail?.data?.phases ?? [];

    const gotPhases = phases.map((p) => p.phase);
    const exactSixInOrder = gotPhases.length === 6 && EXPECTED_PHASES.every((p, i) => gotPhases[i] === p);
    const allInactive = phases.every((p) => p.isActive === false);

    if (exactSixInOrder && allInactive) {
      kesimpulan = "Lolos";
      catatan = `Proyek baru "${projectName}" otomatis mendapat 6 fase persis sesuai urutan siklus IEC 62305 (${gotPhases.join(" → ")}), semuanya belum aktif (isActive=false) sampai Team Leader mengaktifkannya manual.`;
    } else {
      catatan = `Fase yang muncul: ${JSON.stringify(phases.map((p) => ({ phase: p.phase, isActive: p.isActive })))}`;
    }

    // Bersih-bersih: proyek baru ini kosong (belum ada dokumen), boleh dihapus permanen.
    await fetch(`${BASE_URL}/api/projects/${projectId}`, { method: "DELETE", headers: { Cookie: cookie } });
  }

  rows.push({
    kode: "FR-08",
    skenario: "Proyek baru otomatis mendapat 6 fase tetap (INISIASI..INSPEKSI_BERKALA), semua belum aktif",
    hasil: catatan,
    kesimpulan,
  });

  const header = "kode,skenario,hasil,kesimpulan\n";
  const csv = rows.map((r) => [r.kode, r.skenario, r.hasil, r.kesimpulan].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  writeFileSync("docs/pengujian/hasil-fr08-fase-proyek.csv", header + csv + "\n");

  console.log(`FR-08: ${kesimpulan}`);
  console.log(catatan);
}

main().catch((e) => { console.error(e); process.exit(1); });
