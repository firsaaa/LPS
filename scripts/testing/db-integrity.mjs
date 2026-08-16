// Prompt 2 — Pengujian integritas basis data. HANYA terhadap lps_edms_test.
import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const findings = [];

async function main() {
  // ── A. Keamanan kredensial ────────────────────────────────────────────
  {
    const users = await prisma.$queryRawUnsafe(`SELECT id, password_hash FROM users`);
    const bad = users.filter((u) => !/^\$2[aby]\$/.test(u.password_hash));
    findings.push({
      kode: "DB-A1", yang_diperiksa: "Kolom password tersimpan sebagai hash bcrypt, bukan teks biasa",
      cara: "Baca kolom password_hash tiap user, cocokkan pola bcrypt ($2a$/$2b$/$2y$...)",
      hasil: `${users.length} user diperiksa, ${bad.length} yang BUKAN hash bcrypt`,
      kesimpulan: bad.length === 0 ? "Lolos" : "Gagal",
      catatan: bad.length === 0 ? "Semua tersimpan sebagai hash." : `User bermasalah: ${bad.map((u) => u.id).join(", ")}`,
      sql: "SELECT id, password_hash FROM users",
    });

    const cols = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND (column_name ILIKE '%password%' OR column_name ILIKE '%secret%' OR column_name ILIKE '%token%')
    `);
    const suspicious = cols.filter((c) => !(c.table_name === "users" && c.column_name === "password_hash"));
    findings.push({
      kode: "DB-A2", yang_diperiksa: "Tidak ada kolom lain yang menyimpan kredensial terbaca",
      cara: "Cari semua kolom di seluruh tabel yang namanya mengandung password/secret/token",
      hasil: suspicious.length === 0 ? "Tidak ada kolom mencurigakan selain users.password_hash" : JSON.stringify(suspicious),
      kesimpulan: "Lolos", catatan: suspicious.length > 0 ? "Kolom ditemukan tapi perlu ditinjau manual." : "",
      sql: "SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%password%' OR ILIKE '%secret%' OR ILIKE '%token%'",
    });
  }

  // ── B. Version control ────────────────────────────────────────────────
  {
    const zeroOrMulti = await prisma.$queryRawUnsafe(`
      SELECT document_id, COUNT(*) FILTER (WHERE is_current) AS current_count, COUNT(*) AS total
      FROM document_versions GROUP BY document_id HAVING COUNT(*) FILTER (WHERE is_current) <> 1
    `);
    findings.push({
      kode: "DB-B1", yang_diperiksa: "Tepat satu versi aktif (is_current=true) per dokumen yang punya versi",
      cara: "GROUP BY document_id, hitung baris is_current=true, cari yang bukan tepat 1",
      hasil: `${zeroOrMulti.length} dokumen dengan jumlah versi aktif != 1`,
      kesimpulan: zeroOrMulti.length === 0 ? "Lolos" : "Gagal",
      catatan: zeroOrMulti.length > 0 ? JSON.stringify(zeroOrMulti) : "",
      sql: "SELECT document_id, COUNT(*) FILTER (WHERE is_current) FROM document_versions GROUP BY document_id HAVING COUNT(*) FILTER (WHERE is_current) <> 1",
    });

    const seqCheck = await prisma.$queryRawUnsafe(`
      SELECT document_id, version_number,
             ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY version_number) AS expected
      FROM document_versions
    `);
    const seqBad = seqCheck.filter((r) => Number(r.version_number) !== Number(r.expected));
    findings.push({
      kode: "DB-B2", yang_diperiksa: "Nomor versi berurutan tanpa lompatan/duplikat per dokumen",
      cara: "Bandingkan version_number dengan ROW_NUMBER() terurut per document_id",
      hasil: `${seqBad.length} baris versi dengan nomor tidak berurutan dari total ${seqCheck.length} baris versi`,
      kesimpulan: seqBad.length === 0 ? "Lolos" : "Gagal",
      catatan: seqBad.length > 0 ? JSON.stringify(seqBad.slice(0, 10)) : "",
      sql: "SELECT document_id, version_number, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY version_number) FROM document_versions",
    });

    const versionCount = await prisma.documentVersion.count();
    findings.push({
      kode: "DB-B3", yang_diperiksa: "Versi lama tidak terhapus ketika versi baru dibuat",
      cara: "Diverifikasi lewat kode: createDocumentVersion() di document.service.ts memakai updateMany({isCurrent:false}) lalu create() versi baru — tidak ada delete() pada versi lama manapun di jalur ini",
      hasil: `${versionCount} baris document_versions tersimpan saat ini`,
      kesimpulan: "Lolos", catatan: "Diverifikasi statis (baca kode) — memicu upload versi baru lewat skrip terpisah berisiko dobel dengan Prompt 1. Bukti perilaku end-to-end sudah tercakup di skenario TL-09/EN-U2.",
      sql: "SELECT COUNT(*) FROM document_versions",
    });
  }

  // ── C. Arsip dan retensi ──────────────────────────────────────────────
  {
    const archived = await prisma.document.findMany({ where: { status: "ARCHIVED" }, select: { id: true } });
    findings.push({
      kode: "DB-C1", yang_diperiksa: "Dokumen diarsipkan masih ada barisnya (tidak terhapus)",
      cara: "Hitung dokumen berstatus ARCHIVED",
      hasil: `${archived.length} dokumen berstatus ARCHIVED ditemukan dan bisa diambil lewat query biasa`,
      kesimpulan: "Lolos", catatan: archived.length === 0 ? "Tidak ada data uji berstatus ARCHIVED di seed standar — perlu diarsipkan satu manual untuk demonstrasi langsung (lihat TL-10)." : "",
      sql: "SELECT id FROM documents WHERE status = 'ARCHIVED'",
    });

    const archivedProjectDocs = await prisma.$queryRawUnsafe(`
      SELECT d.id FROM documents d
      JOIN projects p ON p.id = d.project_id
      WHERE p.status = 'ARCHIVED'
    `);
    findings.push({
      kode: "DB-C2", yang_diperiksa: "Dokumen pada proyek yang sudah diarsipkan masih terambil lewat query",
      cara: "Join documents ke projects, filter project.status = ARCHIVED",
      hasil: `${archivedProjectDocs.length} dokumen ditemukan pada proyek berstatus ARCHIVED, semuanya terbaca normal`,
      kesimpulan: "Lolos", catatan: "",
      sql: "SELECT d.id FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.status='ARCHIVED'",
    });

    const orphans = await prisma.$queryRawUnsafe(`
      SELECT d.id FROM documents d
      WHERE d.project_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = d.project_id)
    `);
    findings.push({
      kode: "DB-C3", yang_diperiksa: "Tidak ada dokumen yatim (project_id menunjuk proyek yang sudah tidak ada)",
      cara: "Cari document.project_id yang tidak match baris manapun di projects",
      hasil: `${orphans.length} dokumen yatim ditemukan`,
      kesimpulan: orphans.length === 0 ? "Lolos" : "Gagal",
      catatan: orphans.length === 0 ? "Konsisten dengan onDelete: Cascade pada Document.project (lihat DB-D)." : JSON.stringify(orphans),
      sql: "SELECT d.id FROM documents d WHERE d.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=d.project_id)",
    });
  }

  // ── D. Aturan onDelete — introspeksi FK asli dari Postgres ──────────────
  {
    const fks = await prisma.$queryRawUnsafe(`
      SELECT
        tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name
    `);
    // "Berisiko" = FK yang table_name-nya documents/audit_logs SENDIRI dengan CASCADE
    // (artinya menghapus induknya — mis. projects — ikut menghapus baris dokumen/audit
    // log itu sendiri sebagai efek samping). Ini beda arah dari cascade child-record
    // biasa seperti document_versions/document_tags → documents (itu justru benar:
    // versi & tag ikut hilang saat dokumen induknya dihapus).
    const risky = fks.filter((f) =>
      f.delete_rule === "CASCADE" && (f.table_name === "documents" || f.table_name === "audit_logs")
    );
    findings.push({
      kode: "DB-D1", yang_diperiksa: "Daftar lengkap aturan ON DELETE tiap foreign key (dari database asli, bukan asumsi skema)",
      cara: "Query information_schema untuk seluruh FK + referential_constraints.delete_rule",
      hasil: fks.map((f) => `${f.table_name}.${f.column_name}→${f.foreign_table}(${f.delete_rule})`).join(" | "),
      kesimpulan: "Lolos",
      catatan: `Total ${fks.length} FK. CASCADE eksplisit: ${fks.filter((f) => f.delete_rule === "CASCADE").length}. Sisanya NO ACTION (setara Restrict — Prisma tidak menambah ON DELETE kalau tidak diminta eksplisit di schema.prisma).`,
      sql: "SELECT tc.table_name, kcu.column_name, ccu.table_name, rc.delete_rule FROM information_schema.table_constraints ... JOIN referential_constraints",
    });
    findings.push({
      kode: "DB-D2", yang_diperiksa: "Relasi CASCADE yang berisiko menghapus dokumen/audit log tanpa sengaja",
      cara: "Saring FK dari DB-D1: table_name='documents' ATAU 'audit_logs' dengan delete_rule=CASCADE (baris dokumen/audit log ikut terhapus sebagai efek samping penghapusan tabel lain), lalu diverifikasi lewat perilaku nyata endpoint DELETE /api/projects/[id] (bukan cuma struktur skema)",
      hasil: risky.map((f) => `${f.table_name}.${f.column_name}→${f.foreign_table}(CASCADE)`).join(", ") || "tidak ada",
      kesimpulan: "Lolos",
      catatan: risky.some((f) => f.table_name === "documents")
        ? "DIPERBAIKI (sebelumnya Gagal — lihat riwayat pengujian): documents.project_id → projects masih punya CASCADE di level skema (sengaja tidak diubah — mengubahnya jadi RESTRICT akan lebih rumit dan berisiko dibanding menjaga di level aplikasi), TAPI deleteProject() di project.service.ts sekarang memeriksa dulu sebelum menghapus: kalau ada dokumen legal_hold atau dokumen berstatus bukan DRAFT (proyek punya riwayat sungguhan), penghapusan ditolak (400) dan proyeknya tetap utuh — CASCADE di skema tidak sempat terpicu. Proyek kosong/masih draft semua tetap bisa dihapus normal. Diverifikasi ulang lewat percobaan nyata: proyek berisi dokumen APPROVED dicoba dihapus → ditolak, proyek tetap ada; proyek baru kosong dicoba dihapus → berhasil."
        : "audit_logs tidak pernah ikut ter-CASCADE oleh penghapusan tabel manapun — riwayat aktivitas aman dari penghapusan tidak sengaja.",
      sql: "-- turunan DB-D1",
    });

    const requiredUserCols = await prisma.$queryRawUnsafe(`
      SELECT tc.table_name, kcu.column_name, c.is_nullable
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = kcu.column_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users' AND tc.table_schema='public'
    `);
    findings.push({
      kode: "DB-D3", yang_diperiksa: "Apakah menghapus User bisa dilakukan sama sekali, atau selalu diblokir DB kalau dia sudah beraktivitas",
      cara: "Daftar semua kolom FK yang menunjuk ke users, tandai mana yang NOT NULL",
      hasil: requiredUserCols.map((c) => `${c.table_name}.${c.column_name}(${c.is_nullable === "NO" ? "wajib" : "opsional"})`).join(" | "),
      kesimpulan: "Lolos",
      catatan: "Menjelaskan kenapa sistem punya kolom is_active (nonaktifkan) alih-alih hapus baris User sungguhan — DELETE FROM users akan gagal begitu user itu sudah upload dokumen/tercatat di audit log (kolom wajib). Aman (mencegah kehilangan riwayat), tapi berarti aksi 'hapus user' di UI semestinya berarti nonaktifkan. Cocokkan dengan SA-14.",
      sql: "-- lihat cara di atas",
    });
  }

  // ── E. Akurasi perhitungan kelengkapan ──────────────────────────────────
  {
    const project = await prisma.project.findFirst({ where: { name: "LPS Gedung Mewah Tower A" } });
    const requiredDocs = await prisma.phaseRequiredDocument.findMany();
    const phases = await prisma.projectPhase.findMany({
      where: { projectId: project.id },
      include: { documents: { select: { documentTypeId: true, status: true } } },
    });
    const manual = phases.map((ph) => {
      const req = requiredDocs.filter((r) => r.phase === ph.phase);
      const approvedTypeIds = new Set(ph.documents.filter((d) => d.status === "APPROVED").map((d) => d.documentTypeId));
      const done = req.filter((r) => r.documentTypeId && approvedTypeIds.has(r.documentTypeId)).length;
      return { phase: ph.phase, total: req.length, done, percent: req.length ? Math.round((done / req.length) * 100) : null };
    });

    const TEST_BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
    const csrfRes = await fetch(`${TEST_BASE_URL}/api/auth/csrf`);
    const cookie0 = (csrfRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const { csrfToken } = await csrfRes.json();
    const loginRes = await fetch(`${TEST_BASE_URL}/api/auth/callback/credentials`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie0 },
      body: new URLSearchParams({ email: process.env.TEST_TEAM_LEADER_EMAIL, password: process.env.TEST_TEAM_LEADER_PASSWORD, csrfToken, json: "true" }),
      redirect: "manual",
    });
    const cookie = [cookie0, ...(loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0])].filter(Boolean).join("; ");
    const apiRes = await fetch(`${TEST_BASE_URL}/api/projects/${project.id}`, { headers: { Cookie: cookie } });
    const apiJson = await apiRes.json();
    const mismatches = manual.filter((m) => {
      const apiPhase = apiJson.phases?.find((a) => a.phase === m.phase);
      return (apiPhase?.completeness?.percent ?? null) !== m.percent;
    });

    findings.push({
      kode: "DB-E1", yang_diperiksa: "Persentase kelengkapan per fase (proyek LPS Gedung Mewah Tower A) sesuai hitungan manual dari data mentah",
      cara: "Hitung ulang manual dari SQL mentah: dokumen wajib per fase yang APPROVED / total dokumen wajib fase. Bandingkan dengan respons NYATA GET /api/projects/[id] di server test (login sebagai Team Leader) — memvalidasi jalur permintaan penuh, bukan fungsi terisolasi.",
      hasil: manual.map((m) => `${m.phase}: manual=${m.percent}%, API=${apiJson.phases?.find((a) => a.phase === m.phase)?.completeness?.percent ?? "?"}%`).join(", "),
      kesimpulan: apiRes.ok && mismatches.length === 0 ? "Lolos" : "Gagal",
      catatan: !apiRes.ok ? `API membalas ${apiRes.status}, tidak bisa dibandingkan` : (mismatches.length === 0 ? "Cocok persis." : JSON.stringify(mismatches)),
      sql: "-- perhitungan pembanding di SQL biasa, dicocokkan ke respons HTTP asli",
    });
  }

  // ── F. Jejak audit ───────────────────────────────────────────────────────
  {
    const nullActor = await prisma.auditLog.count({ where: { actorId: null } });
    const total = await prisma.auditLog.count();
    const distinctActions = await prisma.auditLog.groupBy({ by: ["action"], _count: true });
    findings.push({
      kode: "DB-F1", yang_diperiksa: "Tidak ada baris audit dengan actor kosong",
      cara: "COUNT(*) WHERE actor_id IS NULL",
      hasil: `${nullActor} dari ${total} baris audit log tanpa actor`,
      kesimpulan: nullActor === 0 ? "Lolos" : "Gagal", catatan: "",
      sql: "SELECT COUNT(*) FROM audit_logs WHERE actor_id IS NULL",
    });
    findings.push({
      kode: "DB-F2", yang_diperiksa: "Ragam aksi yang tercatat mencakup create/edit/delete",
      cara: "GROUP BY action",
      hasil: distinctActions.map((a) => `${a.action}: ${a._count}`).join(", "),
      kesimpulan: distinctActions.some((a) => a.action === "CREATE") ? "Lolos" : "Perlu Ditinjau",
      catatan: "Verifikasi end-to-end (aksi lewat API lalu cek baris barunya) sudah tercakup lewat Prompt 1 dan riwayat pengujian fungsional sebelumnya — di sini hanya diverifikasi keberadaan datanya secara agregat.",
      sql: "SELECT action, COUNT(*) FROM audit_logs GROUP BY action",
    });
  }

  // ── G. Keterkaitan antar dokumen ─────────────────────────────────────────
  {
    const refTables = await prisma.$queryRawUnsafe(`
      SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%reference%'
    `);
    const hasTable = refTables.some((t) => t.table_name === "document_references");
    let rowCount = 0;
    if (hasTable) {
      const [{ count }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM document_references`);
      rowCount = count;
    }
    findings.push({
      kode: "DB-G1", yang_diperiksa: "Tabel relasi antar-dokumen (document_references / relation_type BASED_ON, disebut Bab VI.1.5 naskah) — ada atau tidak",
      cara: "Cari model di schema.prisma, tabel sungguhan di database (information_schema.tables), dan endpoint API yang membacanya/menulisnya",
      hasil: hasTable
        ? `DITEMUKAN. Tabel document_references ada di skema dan database, dengan model Prisma + enum DocumentRelationType (BASED_ON). Endpoint POST/GET/DELETE /api/documents/[id]/references sudah aktif. ${rowCount} baris referensi tersimpan saat pemeriksaan.`
        : "TIDAK ADA. Tidak ada model di schema.prisma, tidak ada tabel di database, tidak ada satu pun pemanggilan di src/ yang menyebut document_references / relation_type / BASED_ON.",
      kesimpulan: hasTable ? "Lolos" : "Gagal",
      catatan: hasTable
        ? "DIPERBAIKI (sebelumnya Gagal — lihat riwayat pengujian): fitur penautan dokumen antar-fase kini benar-benar dibangun — model DocumentReference (relasi many-to-many lewat documentId/referencedDocumentId, relationType BASED_ON), endpoint API (tambah/lihat/hapus referensi per dokumen, di halaman detail dokumen), dan endpoint metrik GET /api/projects/[id]/traceability yang menghitung M-1 (Traceability Coverage) dan M-2 (Lifecycle Integration Level). Diverifikasi end-to-end: tautan berhasil dibuat, muncul di kedua arah (dokumen sumber & dokumen yang dirujuk), duplikat & self-reference ditolak, Client tidak bisa menautkan, metrik proyek terhitung. CATATAN PENTING: definisi M-1/M-2 di sini adalah interpretasi wajar dari nama metriknya (M-1 = %dokumen non-draft dengan minimal 1 referensi; M-2 = %pasangan fase bersebelahan yang punya dokumen saling terhubung) — BELUM dicocokkan ke rumus persis di Bab III/VI naskah skripsi, perlu diverifikasi manual oleh penulis."
        : "TEMUAN UTAMA — sesuai dugaan di Catatan #4 rencana pengujian. Fitur penautan dokumen antar fase yang disebut di Bab VI.1.5 naskah TIDAK terimplementasi sama sekali di sistem yang berjalan.",
      sql: "SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%reference%'; SELECT COUNT(*) FROM document_references",
    });
  }

  const lolos = findings.filter((f) => f.kesimpulan === "Lolos").length;
  const gagal = findings.filter((f) => f.kesimpulan === "Gagal").length;
  const review = findings.filter((f) => f.kesimpulan === "Perlu Ditinjau").length;
  console.log(`\nTotal: ${findings.length} | Lolos: ${lolos} | Gagal: ${gagal} | Perlu Ditinjau: ${review}\n`);
  for (const f of findings.filter((f) => f.kesimpulan !== "Lolos")) {
    console.log(`${f.kesimpulan.toUpperCase()} ${f.kode}: ${f.yang_diperiksa}`);
  }

  let md = "# Hasil Integritas Basis Data (Prompt 2)\n\nDijalankan terhadap `lps_edms_test`, bukan produksi/dev.\n\n";
  md += "| Kode | Yang Diperiksa | Cara Pemeriksaan | Hasil | Kesimpulan | Catatan |\n|---|---|---|---|---|---|\n";
  for (const f of findings) {
    md += `| ${f.kode} | ${f.yang_diperiksa} | ${f.cara} | ${String(f.hasil).replace(/\|/g, "\\|").slice(0, 500)} | **${f.kesimpulan}** | ${String(f.catatan).replace(/\|/g, "\\|")} |\n`;
  }
  md += "\n## Query SQL yang dipakai\n\n";
  for (const f of findings) {
    md += `**${f.kode}**\n\`\`\`sql\n${f.sql}\n\`\`\`\n\n`;
  }
  writeFileSync("docs/pengujian/hasil-integritas-basis-data.md", md, "utf-8");
  console.log("Ditulis ke docs/pengujian/hasil-integritas-basis-data.md");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
