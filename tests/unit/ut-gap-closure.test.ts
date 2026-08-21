// Bagian A — unit test MURNI (tanpa database, jaringan, atau filesystem),
// menutup 3 celah: tabel transisi status dokumen (A1), pembangkitan kode
// dokumen (A2), dan persentase kelengkapan fase (A3).
//
// Kode dimulai dari UT-30 (BUKAN UT-01) supaya tidak tabrakan dengan
// tests/unit/ut-suite.test.ts yang sudah ada (UT-01..UT-29, dibiarkan utuh
// sesuai instruksi "jangan ubah test yang sudah ada"). File itu juga sudah
// mengandung beberapa test yang menyentuh database asli (lps_edms, dev DB)
// meski berlabel "unit test" — sudah dilaporkan sebagai temuan terpisah.
//
// Perubahan struktur yang dilakukan supaya bagian ini bisa diuji murni (tanpa DB):
//   1. VALID_TRANSITIONS/ACTION_MAP/STATUS_LABEL_ID dipindah dari didefinisikan
//      inline di src/app/api/documents/[id]/approve/route.ts menjadi diekspor
//      dari file baru src/lib/document-status.ts (nilai/logika identik, cuma
//      pindah lokasi). route.ts sekarang mengimpor dari situ.
//   2. Logika "nomor urut berikutnya" yang sebelumnya menyatu di dalam
//      transaksi Prisma pada generateDocumentCode() diekstrak jadi dua fungsi
//      murni baru di document-code.service.ts: nextSequenceForPrefix() dan
//      formatSequence(). generateDocumentCode() sekarang memanggil keduanya
//      alih-alih menghitung inline — perilaku akhir tidak berubah.
//   3. attachCompleteness() (project.service.ts) TIDAK diubah sama sekali —
//      sudah murni sejak awal (tidak memanggil Prisma).
//
// PEMBARUAN: setelah jalan pertama file ini (UT-33, UT-38a/b/c GAGAL), 3 bug
// asli sudah diperbaiki atas instruksi eksplisit penulis ("benerin bug-bugnya
// dulu"): isValidTransition() (document-status.ts) sekarang aman terhadap
// status di luar enum; buildCodePrefix() (document-code.service.ts) sekarang
// melempar Error yang jelas untuk komponen kosong/fase tidak dikenal alih-alih
// diam-diam menghasilkan kode cacat. Test di bawah diperbarui mengikuti
// perilaku BARU yang sudah benar — bukan disesuaikan supaya lolos tanpa
// perbaikan nyata di kode aplikasi.
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "fs";
import { VALID_TRANSITIONS, isValidTransition } from "@/lib/document-status";
import { buildCodePrefix, nextSequenceForPrefix, formatSequence } from "@/lib/services/document-code.service";
import { attachCompleteness } from "@/lib/services/project.service";
import type { DocumentStatus } from "@prisma/client";

type Rec = { kode: string; jenis: "Positive" | "Negative"; deskripsi: string; expected: string; actual: string; status: "PASS" | "FAIL" };
const results: Rec[] = [];
const findings: Record<string, unknown>[] = [];

/** Menjalankan satu skenario UT: fn() melakukan assert-nya sendiri (expect(...)),
 * dan mengembalikan deskripsi singkat "actual" untuk dicatat ke JSON. Kalau fn()
 * melempar (assertion gagal), tetap dicatat sebagai FAIL sebelum dilempar ulang
 * supaya laporan vitest sendiri tetap jujur menunjukkan kegagalan. */
function ut(kode: string, jenis: "Positive" | "Negative", deskripsi: string, expected: string, fn: () => string) {
  it(`${kode}: ${deskripsi}`, () => {
    try {
      const actual = fn();
      results.push({ kode, jenis, deskripsi, expected, actual, status: "PASS" });
    } catch (e) {
      const actual = `Assertion gagal: ${e instanceof Error ? e.message : String(e)}`;
      results.push({ kode, jenis, deskripsi, expected, actual, status: "FAIL" });
      throw e;
    }
  });
}

// ─── A1: Tabel transisi status dokumen (src/lib/document-status.ts) ────────
describe("A1 — VALID_TRANSITIONS [UT-30..UT-34]", () => {
  const allValidPairs: [DocumentStatus, DocumentStatus][] = [];
  for (const [from, tos] of Object.entries(VALID_TRANSITIONS) as [DocumentStatus, DocumentStatus[]][]) {
    for (const to of tos) allValidPairs.push([from, to]);
  }

  allValidPairs.forEach(([from, to], i) => {
    const suffix = String.fromCharCode(97 + i); // a, b, c, ...
    ut(`UT-30${suffix}`, "Positive", `Transisi sah ${from} -> ${to} diterima`,
      `VALID_TRANSITIONS["${from}"] memuat "${to}"`,
      () => {
        expect(VALID_TRANSITIONS[from]).toContain(to);
        return `VALID_TRANSITIONS["${from}"] = [${VALID_TRANSITIONS[from].join(", ")}] memuat "${to}": true`;
      });
  });

  ut("UT-31", "Negative", "Transisi melompat DRAFT -> APPROVED (tanpa lewat UNDER_REVIEW) ditolak",
    "VALID_TRANSITIONS[\"DRAFT\"] TIDAK memuat \"APPROVED\"",
    () => {
      expect(VALID_TRANSITIONS.DRAFT).not.toContain("APPROVED");
      return `VALID_TRANSITIONS["DRAFT"] = [${VALID_TRANSITIONS.DRAFT.join(", ")}] — tidak memuat APPROVED`;
    });

  ut("UT-32", "Negative", "Transisi mundur dari status akhir ARCHIVED -> DRAFT ditolak",
    "VALID_TRANSITIONS[\"ARCHIVED\"] TIDAK memuat \"DRAFT\" (dan kosong sama sekali)",
    () => {
      expect(VALID_TRANSITIONS.ARCHIVED).not.toContain("DRAFT");
      return `VALID_TRANSITIONS["ARCHIVED"] = [${VALID_TRANSITIONS.ARCHIVED.join(", ") || "(kosong)"}]`;
    });

  ut("UT-33", "Negative", "Status yang tidak dikenal ditolak, tidak melempar exception yang tak tertangani",
    "isValidTransition() tidak melempar exception untuk status di luar enum, dan mengembalikan false (ditolak dengan aman)",
    () => {
      // DIPERBAIKI: approve/route.ts sekarang memakai isValidTransition() (lihat
      // document-status.ts), bukan lagi akses langsung VALID_TRANSITIONS[x].includes(y)
      // yang melempar TypeError untuk key tak dikenal. Sebelum perbaikan, test ini GAGAL.
      let threw = false;
      let result: boolean | null = null;
      try { result = isValidTransition("STATUS_TIDAK_DIKENAL", "DRAFT"); }
      catch { threw = true; }
      expect(threw).toBe(false);
      expect(result).toBe(false);
      return `isValidTransition("STATUS_TIDAK_DIKENAL", "DRAFT") = ${result}, tidak melempar exception`;
    });

  ut("UT-34", "Positive", "Status akhir (ARCHIVED) tidak memiliki transisi keluar sama sekali",
    "VALID_TRANSITIONS[\"ARCHIVED\"].length === 0",
    () => {
      expect(VALID_TRANSITIONS.ARCHIVED).toHaveLength(0);
      return `VALID_TRANSITIONS["ARCHIVED"].length = ${VALID_TRANSITIONS.ARCHIVED.length}`;
    });
});
findings.push({
  catatan: "DIPERBAIKI — UT-33 sebelumnya GAGAL, sekarang PASS",
  file: "src/lib/document-status.ts (isValidTransition, baru); src/app/api/documents/[id]/approve/route.ts (memakai isValidTransition() alih-alih akses langsung tabel)",
  baris: "isValidTransition() baru di document-status.ts; approve/route.ts baris pemeriksaan transisi",
  isi: "Sebelumnya, mengakses VALID_TRANSITIONS dengan key di luar 6 nilai enum menghasilkan `undefined`, dan `.includes()` pada `undefined` melempar TypeError. Sekarang ditambah isValidTransition(from, to) yang mengembalikan false dengan aman (`?? false`) untuk key tak dikenal, dan approve/route.ts memakai fungsi ini alih-alih akses tabel langsung. Diperbaiki atas instruksi eksplisit penulis (\"benerin bug-bugnya dulu\"), bukan inisiatif sepihak sebelumnya.",
});

// ─── A2: Pembangkitan kode dokumen (document-code.service.ts) ──────────────
describe("A2 — buildCodePrefix() [UT-35]", () => {
  const cases: [string, string, string, string][] = [
    ["LGM", "INISIASI", "KTR", "LGM-AWL-KTR-"],
    ["LGM", "ASSESSMENT", "RSK", "LGM-ASM-RSK-"],
    ["LGM", "DESIGN", "DES", "LGM-DES-DES-"],
    ["LGM", "IMPLEMENTASI", "LHR", "LGM-IMP-LHR-"],
    ["LGM", "COMMISSIONING", "LOG", "LGM-CMS-LOG-"],
    ["LGM", "INSPEKSI_BERKALA", "LIB", "LGM-INS-LIB-"],
  ];
  cases.forEach(([projectCode, phase, typeCode, expectedPrefix], i) => {
    const suffix = String.fromCharCode(97 + i);
    ut(`UT-35${suffix}`, "Positive", `Prefix terbentuk benar untuk fase ${phase} (${projectCode}/${typeCode})`,
      `"${expectedPrefix}"`,
      () => {
        const actual = buildCodePrefix(projectCode, phase as any, typeCode);
        expect(actual).toBe(expectedPrefix);
        return `"${actual}"`;
      });
  });
});

describe("A2 — formatSequence() [UT-36]", () => {
  ut("UT-36a", "Positive", "Nomor urut 1 diformat 3 digit dengan nol di depan -> \"001\"",
    "\"001\"",
    () => { const a = formatSequence(1); expect(a).toBe("001"); return `"${a}"`; });
  ut("UT-36b", "Positive", "Nomor urut 42 diformat 3 digit dengan nol di depan -> \"042\"",
    "\"042\"",
    () => { const a = formatSequence(42); expect(a).toBe("042"); return `"${a}"`; });
});

describe("A2 — nextSequenceForPrefix() [UT-37]", () => {
  ut("UT-37a", "Positive", "Nomor urut bertambah 1 dari nomor tertinggi yang sudah ada (berurutan: 001,002)",
    "3",
    () => {
      const a = nextSequenceForPrefix(["LGM-ASM-DOC-001", "LGM-ASM-DOC-002"], "LGM-ASM-DOC-");
      expect(a).toBe(3);
      return String(a);
    });
  ut("UT-37b", "Positive", "Nomor urut memakai NILAI TERTINGGI + 1, bukan jumlah baris + 1 (ada celah: 001,005 -> 6, bukan 3)",
    "6 (bukan 3 — celah nomor 002-004 tidak diisi ulang, konsisten dengan generateDocumentCode() asli)",
    () => {
      const a = nextSequenceForPrefix(["LGM-ASM-DOC-001", "LGM-ASM-DOC-005"], "LGM-ASM-DOC-");
      expect(a).toBe(6);
      return String(a);
    });
});

describe("A2 — Negative: komponen prefix kosong/tidak valid [UT-38]", () => {
  // DIPERBAIKI: buildCodePrefix() sekarang melempar Error yang jelas untuk
  // komponen kosong/fase tak dikenal, alih-alih diam-diam menghasilkan kode
  // cacat (tanda hubung ganda / literal "undefined"). Sebelum perbaikan,
  // ketiga test ini GAGAL karena string cacat benar-benar terbentuk.
  ut("UT-38a", "Negative", "typeCode kosong pada buildCodePrefix ditangani — melempar Error, tidak menghasilkan tanda hubung ganda",
    "Melempar Error (bukan menghasilkan \"LGM-ASM--\")",
    () => {
      expect(() => buildCodePrefix("LGM", "ASSESSMENT" as any, "")).toThrow();
      return "buildCodePrefix melempar Error untuk typeCode kosong (tidak lagi menghasilkan string cacat)";
    });
  ut("UT-38b", "Negative", "projectCode kosong pada buildCodePrefix ditangani — melempar Error, tidak menghasilkan prefix diawali tanda hubung",
    "Melempar Error (bukan menghasilkan \"-ASM-DOC-\")",
    () => {
      expect(() => buildCodePrefix("", "ASSESSMENT" as any, "DOC")).toThrow();
      return "buildCodePrefix melempar Error untuk projectCode kosong";
    });
  ut("UT-38c", "Negative", "Fase tidak dikenal pada buildCodePrefix ditangani — melempar Error, tidak menghasilkan literal \"undefined\" di kode",
    "Melempar Error (bukan menghasilkan \"LGM-undefined-DOC-\")",
    () => {
      expect(() => buildCodePrefix("LGM", "FASE_TIDAK_DIKENAL" as any, "DOC")).toThrow();
      return "buildCodePrefix melempar Error untuk fase tidak dikenal";
    });
});
findings.push({
  catatan: "DIPERBAIKI — UT-38a/b/c sebelumnya GAGAL, sekarang PASS",
  file: "src/lib/services/document-code.service.ts",
  baris: "buildCodePrefix (validasi baru ditambahkan di awal fungsi)",
  isi: "Sebelumnya buildCodePrefix(projectCode, phase, typeCode) sekadar menggabungkan string tanpa validasi: typeCode kosong -> \"LGM-ASM--\", projectCode kosong -> \"-ASM-DOC-\", phase tak dikenal -> \"LGM-undefined-DOC-\". Sekarang fungsi ini melempar Error yang jelas untuk ketiga kasus tersebut sebelum sempat menghasilkan string apa pun. Diperbaiki atas instruksi eksplisit penulis. Tetap tidak pernah tereksekusi lewat alur upload normal (projectCode/phase/typeCode semuanya dijamin valid oleh pemanggil), perbaikan ini murni pengaman tambahan.",
});

describe("A2 — Determinisme [UT-39]", () => {
  ut("UT-39", "Positive", "Kode yang dihasilkan konsisten bila fungsi dipanggil dengan masukan yang sama (2x berturut-turut)",
    "Prefix dan nomor urut identik pada kedua pemanggilan",
    () => {
      const p1 = buildCodePrefix("LGM", "ASSESSMENT" as any, "RSK");
      const p2 = buildCodePrefix("LGM", "ASSESSMENT" as any, "RSK");
      const n1 = nextSequenceForPrefix(["LGM-ASM-RSK-001"], "LGM-ASM-RSK-");
      const n2 = nextSequenceForPrefix(["LGM-ASM-RSK-001"], "LGM-ASM-RSK-");
      expect(p1).toBe(p2);
      expect(n1).toBe(n2);
      return `prefix: "${p1}" === "${p2}"; seq: ${n1} === ${n2}`;
    });
});

// ─── A3: Persentase kelengkapan fase (project.service.ts, attachCompleteness) ──
describe("A3 — attachCompleteness() [UT-40..UT-45]", () => {
  const req = (phase: string, id: string, isOptional = false) => ({ phase: phase as any, documentTypeId: id, isOptional });
  const doc = (id: string, status: string) => ({ documentTypeId: id, status });

  ut("UT-40", "Positive", "Nol dari dokumen wajib terpenuhi (semua DRAFT) menghasilkan 0 persen",
    "percent = 0",
    () => {
      const required = [req("DESIGN", "t1"), req("DESIGN", "t2")];
      const phases = [{ phase: "DESIGN" as any, documents: [doc("t1", "DRAFT"), doc("t2", "UNDER_REVIEW")] }];
      const r = attachCompleteness(phases, required)[0].completeness;
      expect(r.percent).toBe(0);
      return `fulfilled=${r.fulfilled}, required=${r.required}, percent=${r.percent}`;
    });

  ut("UT-41", "Positive", "2 dari 3 dokumen wajib terpenuhi -> pembulatan 67 persen",
    "percent = 67 (Math.round(2/3*100))",
    () => {
      const required = [req("DESIGN", "t1"), req("DESIGN", "t2"), req("DESIGN", "t3")];
      const phases = [{ phase: "DESIGN" as any, documents: [doc("t1", "APPROVED"), doc("t2", "APPROVED"), doc("t3", "DRAFT")] }];
      const r = attachCompleteness(phases, required)[0].completeness;
      expect(r.percent).toBe(67);
      return `fulfilled=${r.fulfilled}, required=${r.required}, percent=${r.percent}`;
    });

  ut("UT-42", "Positive", "Seluruh dokumen wajib terpenuhi menghasilkan 100 persen",
    "percent = 100",
    () => {
      const required = [req("DESIGN", "t1"), req("DESIGN", "t2")];
      const phases = [{ phase: "DESIGN" as any, documents: [doc("t1", "APPROVED"), doc("t2", "APPROVED")] }];
      const r = attachCompleteness(phases, required)[0].completeness;
      expect(r.percent).toBe(100);
      return `fulfilled=${r.fulfilled}, required=${r.required}, percent=${r.percent}`;
    });

  ut("UT-43", "Negative", "Dokumen berstatus ARCHIVED tidak dihitung sebagai terpenuhi",
    "Dokumen wajib yang cuma punya versi ARCHIVED tetap dianggap belum fulfilled -> percent = 0",
    () => {
      const required = [req("COMMISSIONING", "t1")];
      const phases = [{ phase: "COMMISSIONING" as any, documents: [doc("t1", "ARCHIVED")] }];
      const r = attachCompleteness(phases, required)[0].completeness;
      expect(r.fulfilled).toBe(0);
      expect(r.percent).toBe(0);
      return `fulfilled=${r.fulfilled}, percent=${r.percent} (status dokumen: ARCHIVED, bukan APPROVED)`;
    });

  ut("UT-44", "Negative", "Fase tanpa dokumen wajib sama sekali tidak menghasilkan pembagian dengan nol",
    "Tidak error/NaN; percent = 100 (required.length === 0 -> dianggap lengkap)",
    () => {
      const phases = [{ phase: "INISIASI" as any, documents: [] }];
      expect(() => attachCompleteness(phases, [])).not.toThrow();
      const r = attachCompleteness(phases, [])[0].completeness;
      expect(Number.isNaN(r.percent)).toBe(false);
      expect(r.percent).toBe(100);
      return `required=${r.required}, percent=${r.percent} (tidak NaN, tidak throw)`;
    });

  ut("UT-45", "Negative", "Dokumen opsional (isOptional=true) tidak ikut memengaruhi persentase",
    "Dokumen opsional yang belum ada sama sekali tidak menurunkan percent — tetap 100 selama yang WAJIB terpenuhi",
    () => {
      const required = [req("DESIGN", "t1", false), req("DESIGN", "t2", true)]; // t2 opsional, tidak diupload sama sekali
      const phases = [{ phase: "DESIGN" as any, documents: [doc("t1", "APPROVED")] }];
      const r = attachCompleteness(phases, required)[0].completeness;
      expect(r.required).toBe(1); // t2 opsional dikeluarkan dari daftar "wajib"
      expect(r.percent).toBe(100);
      return `required=${r.required} (t2 opsional dikeluarkan), fulfilled=${r.fulfilled}, percent=${r.percent}`;
    });
});

afterAll(() => {
  const summary = {
    dijalankan: new Date().toISOString(),
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    hasil: results,
    temuan: findings,
  };
  writeFileSync("docs/pengujian/hasil-unit-testing.json", JSON.stringify(summary, null, 2) + "\n");
});
