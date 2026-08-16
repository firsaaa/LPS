# Hasil Pengujian Performa — LPS EDMS (Prompt 3)

**Revisi kedua, setelah perbaikan kode DAN migrasi indeks trigram** (lihat §6 untuk daftar perbaikan). Pengukuran-pengukuran sebelumnya sudah digantikan seluruhnya oleh angka di dokumen ini — angka lama tidak lagi berlaku, jangan dipakai.

Seluruh pengujian di dokumen ini dijalankan terhadap database `lps_edms_test` yang terisolasi penuh dari database pengembangan (`lps_edms`) maupun produksi (Railway). **Tidak ada satu pun query di dokumen ini yang menyentuh data asli.**

## 0. Catatan metodologi

1. **Tingkat "Besar" tetap diskalakan** (30 proyek × 150 dokumen = 4.500 dokumen, dari spesifikasi awal 50×300) — alasan sama seperti sebelumnya: waktu generate + seluruh rangkaian pengukuran untuk data sebesar itu tidak realistis dalam satu sesi kerja.
2. **Mode server: production build (`next build` + `next start`)**, sama seperti sebelumnya — bukan `next dev`.
3. **Semua pengukuran memakai akun Superadmin uji**, kecuali pengujian unggah berkas (§5) yang memakai akun Team Leader — karena Superadmin sekarang sengaja ditolak untuk aksi unggah dokumen (lihat §6, perbaikan RI-25).
4. **Pengujian unggah berkas (§5) memakai server baru untuk setiap ukuran** (bukan berurutan di satu server seperti sebelumnya) — percobaan awal memakai satu server berurutan (5MB→50MB→150MB) dan hasilnya bising/tidak konsisten (baseline RSS naik terus akibat pemanasan JIT/cache antar-request, bukan mencerminkan biaya unggah itu sendiri). Server baru per ukuran menghasilkan angka yang jauh lebih bersih dan bisa dipercaya.
5. 10 kali percobaan per endpoint pada §1, percobaan pertama dibuang, median dan p95 dihitung dari 9 sisanya. `autocannon` di §4 memakai timeout bawaan 10 detik per request.

---

## 1. Waktu respons per endpoint, per tingkat data (Prompt 3b) — diukur ulang

| Kode | Endpoint | Kecil median/p95 | Sedang median/p95 | Besar median/p95 |
|---|---|---|---|---|
| PF-01 | Dashboard lintas proyek | 112 / 187 ms | 95 / 112 ms | 100 / 166 ms |
| PF-02 | Detail proyek + kelengkapan | 56 / 92 ms | 98 / 193 ms | 148 / 224 ms |
| PF-03 | Daftar dokumen proyek | 50 / 62 ms | 50 / 55 ms | 110 / 347 ms |
| PF-04 | Pencarian judul dokumen (setelah indeks trigram) | — | — | 66 / 100 ms |
| PF-05 | Pencarian isi berkas | 51 / 77 ms | 99 / 119 ms | 171 / 248 ms |
| PF-06 | Pusat Kepatuhan | 91 / 105 ms | 94 / 111 ms | 110 / 147 ms |
| PF-07 | Detail dokumen + versi | 49 / 61 ms | 47 / 50 ms | 78 / 134 ms |

PF-01/02/03/05/06/07 **tidak berubah secara berarti** dari pengukuran sebelumnya — masuk akal, tidak satu pun perbaikan kode menyentuh query dashboard/detail/daftar/kepatuhan. **PF-04 (pencarian judul) DIPERBAIKI**: setelah indeks trigram (`pg_trgm`) ditambahkan (§3.2, §6), diukur ulang khusus di tingkat "Besar" (yang paling menekan) — turun dari 94ms menjadi 66ms median pada volume data yang sama persis. Tidak diukur ulang di tingkat Kecil/Sedang karena perbaikannya bersifat struktural (mengubah rencana query dari pemindaian tabel jadi pemakaian indeks) dan sudah dikonfirmasi langsung lewat `EXPLAIN ANALYZE` (§3.2) — bukan sekadar angka waktu yang kebetulan turun.

## 2. Deteksi N+1 query (Prompt 3c) — diukur ulang

| Kode | Endpoint | Query Kecil | Query Sedang | Query Besar | Skala dengan data? |
|---|---|---|---|---|---|
| PF-01 | Dashboard lintas proyek | 18 | 18 | 18 | Tidak |
| PF-02 | Detail proyek + kelengkapan | 15 | 15 | 15 | Tidak |
| PF-03 | Daftar dokumen proyek | 11 | 11 | 11 | Tidak |
| PF-04 | Pencarian judul | 12 | 12 | 12 | Tidak |
| PF-05 | Pencarian isi berkas | 12 | 12 | 12 | Tidak |
| PF-06 | Pusat Kepatuhan | 19 | 19 | 19 | Tidak |
| PF-07 | Detail dokumen + versi | 16 | 16 | 16 | Tidak |

Identik dengan sebelum perbaikan — **tidak ada pola N+1 yang muncul maupun hilang** akibat perbaikan kode kali ini (masuk akal, ketujuh route ini tidak disentuh).

## 3. EXPLAIN ANALYZE + analisis indeks (Prompt 3d) — 3.2 DIPERBAIKI & diverifikasi ulang

- Indeks komposit yang ada (`project_id+document_type_id`, `project_phase_id+created_at`, `status+updated_at`, `assigned_to_id+status`, GIN `content_tsv`) terbukti dipakai benar oleh planner — tidak berubah.
- **3.2 — Pencarian judul/kode dokumen (`ILIKE '%...%'`), DIPERBAIKI.** Migrasi `20260817001000_document_title_trgm_index` menambahkan `CREATE EXTENSION pg_trgm` + dua indeks GIN (`documents_title_trgm_idx`, `documents_document_code_trgm_idx`). Diverifikasi lewat `EXPLAIN ANALYZE` pada volume data yang sama (4.500 dokumen):
  ```
  Sebelum: Seq Scan on documents (actual time=5.519..16.986) — Execution Time: 17.129 ms
  Sesudah: Bitmap Heap Scan + BitmapOr (Bitmap Index Scan pada kedua indeks trgm)
           (actual time=2.388..2.393) — Execution Time: 2.618 ms
  ```
  Semantik pencarian tidak berubah (tetap "mengandung di mana saja") — hanya rencana eksekusinya yang berubah dari memindai seluruh tabel jadi memakai indeks. Sudah diterapkan ke database uji maupun database pengembangan.
- Kandidat indeks `uploaded_by_id` dan `phase` (project_phases) tetap terbukti tidak diperlukan.

## 4. Uji beban bersamaan (Prompt 3e) — diukur ulang

`autocannon`, build produksi, tingkat "Besar", 30 detik/percobaan, 5/10/20 koneksi bersamaan.

| Endpoint | Koneksi | Req/detik | Latensi p50 | Latensi p99 | Latensi maks | Gagal/Timeout |
|---|---|---|---|---|---|---|
| Dashboard | 5 | 29.0 | 153 ms | 558 ms | 820 ms | 0 |
| Dashboard | 10 | 32.0 | 313 ms | 500 ms | 685 ms | 0 |
| Dashboard | 20 | 33.7 | 551 ms | 1.178 ms | 1.307 ms | **0** |
| Pencarian isi berkas | 5 | 12.9 | 313 ms | 1.056 ms | 1.254 ms | 0 |
| Pencarian isi berkas | 10 | 14.4 | 524 ms | 3.978 ms | 5.896 ms | **0** |
| Pencarian isi berkas | 20 | 19.1 | 962 ms | 2.221 ms | 2.535 ms | 0 |

**Perbedaan dari pengukuran sebelumnya: 0 gagal/timeout di semua kombinasi kali ini**, dibanding sebelumnya (20 timeout di Dashboard-20, 9 timeout + satu request 34,8 detik di Pencarian-10). **Catatan kejujuran metodologis:** tidak ada perbaikan kode sesi ini yang secara langsung menyasar penyebab yang sudah diidentifikasi sebelumnya (connection pool default `pg` `max: 10`, belum diubah) — jadi kemungkinan besar ini **variasi antar-run**, bukan bukti bahwa masalahnya sudah hilang. Pola tidak-monoton yang teramati sebelumnya (gagal di 10 koneksi tapi tidak di 20) sudah dijelaskan sebagai ciri khas kontensi connection pool yang sensitif terhadap waktu, bukan kegagalan deterministik — hasil bersih kali ini konsisten dengan penjelasan itu, bukan bertentangan dengannya. Rekomendasi §4 pengujian sebelumnya (set `connection_limit` eksplisit) **masih berlaku**, belum diterapkan.

## 5. Waktu unggah berkas besar + memori server (Prompt 3f) — diukur ulang, hasil paling berubah

| Ukuran | Status HTTP | Waktu | RSS awal → puncak |
|---|---|---|---|
| 5MB | 201 (berhasil, sama seperti sebelumnya) | 6.07 detik | 193.0MB → 399.7MB (**+206.7MB**) |
| 50MB | **201 (berhasil — sebelumnya 500 gagal)** | 1.74 detik | 220.1MB → 220.1MB (**+0MB**) |
| 150MB | **201 (berhasil — sebelumnya 500 gagal)** | 10.35 detik | 208.2MB → 236.6MB (**+28.3MB**) |

### 5.1 Batas unggah 200MB — **diperbaiki, dikonfirmasi**

50MB dan 150MB yang sebelumnya gagal total (HTTP 500, `TypeError: Failed to parse body as FormData`) sekarang berhasil (HTTP 201). Perbaikan: `next.config.ts` menaikkan `experimental.proxyClientMaxBodySize` ke 200MB (dari bawaan 10MB).

### 5.2 Memori — **diperbaiki untuk berkas besar, temuan baru untuk berkas kecil**

Perbandingan sebelum/sesudah untuk 150MB: **tidak bisa diunggah sama sekali → +28.3MB.** Untuk 50MB: **tidak bisa diunggah sama sekali → +0MB.**

Perbaikan awal (mengganti `req.formData()` dengan multipart parser streaming langsung ke disk, lihat §6) **ternyata tidak cukup sendirian** — pengukuran pertama pasca-perbaikan tetap menunjukkan lonjakan besar (150MB masih +400MB). Investigasi lanjutan menemukan akar masalah sesungguhnya: **lapisan proxy/middleware Next.js sendiri menampung SELURUH isi request ke memori sebelum kode aplikasi (termasuk parser streaming yang baru dibuat) sempat berjalan** — jadi streaming di level kode tidak ada gunanya selama request masih lewat proxy itu. Dikonfirmasi dengan mengecualikan tiga rute unggah (dokumen, versi, notulen) dari `src/proxy.ts`, lalu diukur ulang: lonjakan memori langsung turun ke rentang wajar. Ketiga rute tersebut aman dikecualikan karena masing-masing sudah memeriksa status login sendiri (pola yang sama seperti seluruh API lain di sistem ini — lihat `orientasi.md` §2) — sudah diverifikasi ulang: permintaan tanpa login ke ketiga rute tetap dibalas 401.

**Temuan baru yang muncul selama investigasi ini:** unggah 5MB masih menunjukkan lonjakan besar (+206.7MB), TAPI dikonfirmasi lewat pengujian pembanding (berkas ukuran sama, ekstensi `.dwg` yang tidak memicu ekstraksi teks, hanya naik +19.2MB) bahwa penyebabnya adalah **`pdf-parse` yang mencoba membaca isi berkas** (perilaku yang sudah ada sejak awal, tidak diubah sesi ini — berkas ≤25MB memang selalu dicoba diekstrak isinya, lihat `MAX_EXTRACT_BYTES`), bukan sisa masalah buffering. Ini BUKAN regresi baru — biaya ini sudah ada sebelum sesi perbaikan ini juga, hanya baru terlihat jelas sekarang setelah biaya buffering-nya sendiri hilang.

**Perbaikan kedua yang ditemukan selama investigasi (bukan cuma proxy):** ditemukan bahwa proses OCR latar belakang (`scheduleOcr`) akan membaca ULANG seluruh berkas ke memori tanpa mengecek ukurannya dulu — untuk berkas besar yang ekstraksinya memang sengaja dilewati (>25MB), kode lama tetap menyangka "butuh OCR" dan mencoba baca ulang keseluruhan berkas di latar belakang. Sudah diperbaiki: OCR latar belakang sekarang juga menghormati batas ukuran yang sama.

## 6. Ringkasan perbaikan kode yang diverifikasi ulang di pengujian ini

| # | Perbaikan | Terverifikasi lewat |
|---|---|---|
| 1 | Batas unggah 200MB tercapai (bukan gagal di atas 10MB) | §5.1 — 50MB & 150MB berhasil |
| 2 | Streaming unggah ke disk (bukan buffer penuh di memori) + rute unggah dikecualikan dari proxy yang ikut menampung body | §5.2 — 50MB/150MB naik memori mendekati nol |
| 3 | OCR latar belakang tidak lagi membaca ulang berkas besar yang sengaja dilewati ekstraksinya | §5.2 — ditemukan & diperbaiki selama investigasi ini |
| 4 | Hapus proyek dengan riwayat dokumen ditolak (bukan cascade-delete tanpa syarat) | Diverifikasi terpisah lewat skrip khusus (lihat percakapan) — proyek dengan dokumen APPROVED tetap utuh setelah percobaan hapus |
| 5 | Backdoor Inspector di endpoint `/status` ditutup | §Prompt 1 (`hasil-isolasi-peran.csv`, RI-19 kini Lolos) |
| 6 | Bypass Superadmin di endpoint unggah dokumen ditutup | `hasil-isolasi-peran.csv`, RI-25 kini Lolos |
| 7 | Kode status 400→403 untuk penolakan kewenangan `POST /api/projects` | `hasil-isolasi-peran.csv`, RI-05/15/26 kini Lolos |
| 8 | Permintaan API tanpa login dibalas 401 JSON (bukan redirect 307) | `hasil-isolasi-peran.csv`, RI-01/02/03 kini Lolos |
| 9 | Fitur penautan dokumen antar-fase dibangun (model data, panel UI, metrik M-1/M-2) | `hasil-integritas-basis-data.md`, DB-G1 kini Lolos |
| 10 | Pencarian judul/kode dokumen dipercepat lewat indeks trigram (pg_trgm) | §3.2, §1 — PF-04 kini Lolos, EXPLAIN ANALYZE 17ms→2,6ms |

**Belum diperbaiki (di luar cakupan sesi ini — bukan bagian dari 53 titik uji, murni saran lanjutan):**
- `connection_limit` pool database — §4, kandidat penyebab pola timeout tidak-stabil pada beban bersamaan, butuh perubahan konfigurasi production (bukan migrasi/kode).

## Berkas data mentah (untuk grafik)

- `docs/pengujian/hasil-performa-waktu-respons.csv`
- `docs/pengujian/hasil-performa-n-plus-1.csv`
- `docs/pengujian/hasil-performa-beban-konkuren.csv`
- `docs/pengujian/hasil-performa-unggah.csv`
