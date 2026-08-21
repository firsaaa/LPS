# Instrumen Evaluasi Pakar (E3) — Sistem LPS EDMS

**Tujuan**: instrumen ini untuk diisi manual oleh pembimbing/pakar (bukan hasil pengujian otomatis) sebagai bentuk *expert judgment* terhadap kesesuaian sistem yang telah dibangun dengan kebutuhan penelitian. Setiap indikator disusun berdasarkan fitur yang **benar-benar berjalan** di sistem (dibuktikan lewat pengujian FN/RI/DB/UT/PF pada `docs/pengujian/hasil-gabungan.csv`), bukan daftar generik.

> Catatan untuk penulis: draf ini dikelompokkan mengikuti kategori ISO/IEC 25010, konsisten dengan pengelompokan NFR yang sudah dipakai di laporan (lihat arsitektur sistem §12). Sesuaikan jumlah aspek/indikator dengan format instrumen yang diminta pembimbing/kampus kalau berbeda — struktur di bawah adalah draf awal, bukan baku.

## Identitas Evaluator

| Item | Isian |
|---|---|
| Nama | ______________________ |
| Jabatan/Keahlian | ______________________ |
| Instansi | ______________________ |
| Tanggal Evaluasi | ______________________ |

## Petunjuk Pengisian

Beri tanda (✓) pada kolom skor sesuai penilaian terhadap tiap indikator:

| Skor | Keterangan |
|---|---|
| 4 | Sangat Setuju (sistem memenuhi indikator ini sepenuhnya) |
| 3 | Setuju (sistem memenuhi indikator ini, ada catatan minor) |
| 2 | Kurang Setuju (sistem sebagian memenuhi, perlu perbaikan) |
| 1 | Tidak Setuju (sistem belum memenuhi indikator ini) |

---

## A. Kesesuaian Fungsional (Functional Suitability)

| No | Indikator | 1 | 2 | 3 | 4 | Catatan |
|---|---|---|---|---|---|---|
| A1 | Sistem mendukung pengunggahan dokumen dengan klasifikasi jenis dokumen dan penomoran kode otomatis sesuai fase proyek | | | | | |
| A2 | Sistem mendukung alur persetujuan dokumen (draft → diajukan → disetujui/revisi/ditolak) sesuai peran masing-masing pengguna | | | | | |
| A3 | Sistem mendukung riwayat versi dokumen tanpa kehilangan versi sebelumnya | | | | | |
| A4 | Sistem mendukung penautan keterlacakan antar-dokumen lintas fase (traceability) dan menampilkan metrik cakupannya | | | | | |
| A5 | Sistem mendukung pencatatan notulen rapat dan tindak lanjut (action item) dengan penanggung jawab dan bukti penyelesaian | | | | | |
| A6 | Sistem menyediakan kontrol visibilitas dokumen per peran (Inspector/Client), termasuk opsi bulk (satu saklar untuk semua dokumen) maupun custom per dokumen | | | | | |
| A7 | Sistem menyediakan dashboard/ringkasan kelengkapan dokumen per fase yang akurat | | | | | |
| A8 | Sistem mendukung manajemen pengguna dan peran (Superadmin, Team Leader, Engineer, Inspector, Client) sesuai kebutuhan organisasi proyek LPS | | | | | |

## B. Keandalan (Reliability)

| No | Indikator | 1 | 2 | 3 | 4 | Catatan |
|---|---|---|---|---|---|---|
| B1 | Data dokumen dan riwayat aktivitas tidak hilang akibat penghapusan data lain yang berelasi (mis. penghapusan pengguna/proyek) | | | | | |
| B2 | Sistem pulih otomatis (auto-restart) dan migrasi skema basis data berjalan otomatis setiap penerapan pembaruan | | | | | |
| B3 | Dokumen yang sudah diarsipkan/legal-hold tidak dapat terhapus permanen | | | | | |

## C. Kegunaan (Usability)

| No | Indikator | 1 | 2 | 3 | 4 | Catatan |
|---|---|---|---|---|---|---|
| C1 | Navigasi dan tampilan menyesuaikan peran pengguna yang login (tidak menampilkan menu/aksi yang tidak relevan) | | | | | |
| C2 | Pesan kesalahan (error) berbahasa Indonesia, jelas, dan spesifik terhadap penyebabnya | | | | | |
| C3 | Alur kerja utama (unggah dokumen, review, pencarian, pelaporan) dapat diikuti tanpa pelatihan khusus | | | | | |

## D. Keamanan (Security)

| No | Indikator | 1 | 2 | 3 | 4 | Catatan |
|---|---|---|---|---|---|---|
| D1 | Akses ke data/dokumen dibatasi sesuai peran dan keanggotaan proyek (tidak ada kebocoran data lintas proyek) | | | | | |
| D2 | Kata sandi pengguna disimpan dalam bentuk terenkripsi (hash), bukan teks biasa | | | | | |
| D3 | Berkas dokumen hanya dapat diakses lewat jalur yang memeriksa otorisasi terlebih dahulu | | | | | |

## E. Efisiensi Kinerja (Performance Efficiency)

| No | Indikator | 1 | 2 | 3 | 4 | Catatan |
|---|---|---|---|---|---|---|
| E1 | Waktu respons sistem untuk operasi umum (buka daftar dokumen, pencarian, dashboard) tergolong cepat/wajar | | | | | |
| E2 | Sistem tetap responsif saat diakses banyak pengguna secara bersamaan | | | | | |
| E3 | Sistem dapat menangani volume dokumen dan proyek yang representatif untuk skala organisasi pengguna | | | | | |

## F. Kompatibilitas (Compatibility)

| No | Indikator | 1 | 2 | 3 | 4 | Catatan |
|---|---|---|---|---|---|---|
| F1 | Sistem dapat diakses dengan baik lewat lebih dari satu peramban (browser) yang umum digunakan | | | | | |
| F2 | Sistem mendukung format berkas yang relevan dengan pekerjaan proyek LPS (dokumen, gambar, CAD, arsip) | | | | | |

---

## Kesimpulan Umum

Berdasarkan penilaian di atas, sistem ini dinyatakan:

- [ ] **Layak digunakan tanpa revisi**
- [ ] **Layak digunakan dengan revisi** (lihat catatan)
- [ ] **Tidak layak digunakan** (lihat catatan)

**Catatan/Saran perbaikan:**

______________________________________________________________
______________________________________________________________
______________________________________________________________

**Tanda tangan evaluator:**

______________________________
(______________________)
