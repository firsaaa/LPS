// FR-04 — "Satu pengguna dapat memiliki peran berbeda di proyek yang berbeda."
// Belum pernah diuji sebelumnya — data seed hanya punya Budi selalu TEAM_LEADER dan
// Rina selalu ENGINEER di setiap proyek yang mereka ikuti, jadi belum ada bukti nyata
// bahwa resolusi peran benar-benar per-proyek (bukan cuma per-user secara global).
// Di sini: Rina (ENGINEER di Tower A) ditambahkan sebagai TEAM_LEADER di Mall Central
// (proyek yang sebelumnya sama sekali bukan anggotanya — lihat RI-08), lalu diperiksa
// apakah hak aksesnya benar-benar berbeda di kedua proyek itu secara bersamaan.
// Dijalankan HANYA terhadap server test lokal (lps_edms_test), tidak pernah produksi.
// Dibersihkan otomatis di akhir (peran tambahan dihapus lagi).
import "dotenv/config";
import { writeFileSync } from "fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const PROJECT_TOWER_A = "cmsvrf4mc000wdnrjx6hgo2yt";   // Rina: ENGINEER (sudah ada)
const PROJECT_MALL_CENTRAL = "cmsvrf7g2003bdnrjpznmb1eb"; // Rina: belum jadi anggota
const USER_RINA = "cmsvrf3w1000sdnrjkhslq45d";

const CRED = {
  SUPERADMIN: { email: process.env.TEST_SUPERADMIN_EMAIL, password: process.env.TEST_SUPERADMIN_PASSWORD },
  ENGINEER: { email: process.env.TEST_ENGINEER_EMAIL, password: process.env.TEST_ENGINEER_PASSWORD }, // Rina
};

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
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status, json };
}

async function main() {
  const rows = [];
  const adminCookie = await login("SUPERADMIN");
  const rinaCookie = await login("ENGINEER");

  // Sebelum: pastikan status awal sesuai asumsi (RI-08).
  const beforeMall = await req(rinaCookie, "GET", `/api/projects/${PROJECT_MALL_CENTRAL}`);
  const beforeTowerA = await req(rinaCookie, "PATCH", `/api/projects/${PROJECT_TOWER_A}`, { name: "coba ubah (harus ditolak)" });

  // Superadmin menambahkan Rina sebagai TEAM_LEADER di Mall Central.
  const addRes = await req(adminCookie, "POST", `/api/projects/${PROJECT_MALL_CENTRAL}/members`, { userId: USER_RINA, role: "TEAM_LEADER" });
  const memberId = addRes.json?.id ?? addRes.json?.data?.id;

  let kesimpulan = "Gagal";
  let catatan = "";

  if (addRes.status !== 201 || !memberId) {
    catatan = `Superadmin gagal menambahkan Rina sebagai TEAM_LEADER di Mall Central (status ${addRes.status}): ${JSON.stringify(addRes.json).slice(0, 300)}`;
  } else {
    // Sesudah: cek DUA proyek dalam sesi Rina yang SAMA (satu login, satu cookie).
    const afterMallGet = await req(rinaCookie, "GET", `/api/projects/${PROJECT_MALL_CENTRAL}`);
    const afterMallPatch = await req(rinaCookie, "PATCH", `/api/projects/${PROJECT_MALL_CENTRAL}`, { name: "LPS Gedung Parkir Mall Central" });
    const afterTowerAPatch = await req(rinaCookie, "PATCH", `/api/projects/${PROJECT_TOWER_A}`, { name: "coba ubah (harus tetap ditolak)" });

    const buktiSebelum = beforeMall.status === 403 || beforeMall.status === 404;
    const buktiSesudahMallBolehLihat = afterMallGet.status === 200;
    const buktiSesudahMallBolehEdit = afterMallPatch.status === 200; // TEAM_LEADER di sini
    const buktiTowerATetapDitolak = afterTowerAPatch.status === 403; // tetap cuma ENGINEER di sini

    if (buktiSebelum && buktiSesudahMallBolehLihat && buktiSesudahMallBolehEdit && buktiTowerATetapDitolak) {
      kesimpulan = "Lolos";
      catatan = `Sebelum: Rina bukan anggota Mall Central (GET→${beforeMall.status}). Setelah ditambahkan sebagai TEAM_LEADER di Mall Central (oleh Superadmin): dalam SESI LOGIN YANG SAMA, Rina bisa GET (${afterMallGet.status}) dan PATCH (${afterMallPatch.status}) Mall Central sebagai Team Leader, TAPI PATCH ke Tower A tetap ditolak (${afterTowerAPatch.status}) karena di sana perannya masih ENGINEER. Membuktikan resolusi peran benar-benar per-proyek, bukan flag global per-user.`;
    } else {
      catatan = `Sebelum(mall get)=${beforeMall.status}, sesudah(mall get)=${afterMallGet.status}, sesudah(mall patch)=${afterMallPatch.status}, sesudah(towerA patch)=${afterTowerAPatch.status}`;
    }

    // Bersih-bersih wajib: hapus lagi peran tambahan yang baru dibuat untuk pengujian ini.
    await req(adminCookie, "DELETE", `/api/projects/${PROJECT_MALL_CENTRAL}/members`, { memberId });
  }

  rows.push({
    kode: "FR-04",
    skenario: "Satu pengguna (Rina) punya peran berbeda di dua proyek berbeda secara bersamaan (ENGINEER di Tower A, TEAM_LEADER di Mall Central)",
    hasil: catatan,
    kesimpulan,
  });

  const header = "kode,skenario,hasil,kesimpulan\n";
  const csv = rows.map((r) => [r.kode, r.skenario, r.hasil, r.kesimpulan].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  writeFileSync("docs/pengujian/hasil-fr04-multi-peran.csv", header + csv + "\n");

  console.log(`FR-04: ${kesimpulan}`);
  console.log(catatan);
}

main().catch((e) => { console.error(e); process.exit(1); });
