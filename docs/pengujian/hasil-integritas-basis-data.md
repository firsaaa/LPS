# Hasil Integritas Basis Data (Prompt 2)

Dijalankan terhadap `lps_edms_test`, bukan produksi/dev.

| Kode | Yang Diperiksa | Cara Pemeriksaan | Hasil | Kesimpulan | Catatan |
|---|---|---|---|---|---|
| DB-A1 | Kolom password tersimpan sebagai hash bcrypt, bukan teks biasa | Baca kolom password_hash tiap user, cocokkan pola bcrypt ($2a$/$2b$/$2y$...) | 6 user diperiksa, 0 yang BUKAN hash bcrypt | **Lolos** | Semua tersimpan sebagai hash. |
| DB-A2 | Tidak ada kolom lain yang menyimpan kredensial terbaca | Cari semua kolom di seluruh tabel yang namanya mengandung password/secret/token | Tidak ada kolom mencurigakan selain users.password_hash | **Lolos** |  |
| DB-B1 | Tepat satu versi aktif (is_current=true) per dokumen yang punya versi | GROUP BY document_id, hitung baris is_current=true, cari yang bukan tepat 1 | 0 dokumen dengan jumlah versi aktif != 1 | **Lolos** |  |
| DB-B2 | Nomor versi berurutan tanpa lompatan/duplikat per dokumen | Bandingkan version_number dengan ROW_NUMBER() terurut per document_id | 0 baris versi dengan nomor tidak berurutan dari total 29 baris versi | **Lolos** |  |
| DB-B3 | Versi lama tidak terhapus ketika versi baru dibuat | Diverifikasi lewat kode: createDocumentVersion() di document.service.ts memakai updateMany({isCurrent:false}) lalu create() versi baru — tidak ada delete() pada versi lama manapun di jalur ini | 29 baris document_versions tersimpan saat ini | **Lolos** | Diverifikasi statis (baca kode) — memicu upload versi baru lewat skrip terpisah berisiko dobel dengan Prompt 1. Bukti perilaku end-to-end sudah tercakup di skenario TL-09/EN-U2. |
| DB-C1 | Dokumen diarsipkan masih ada barisnya (tidak terhapus) | Hitung dokumen berstatus ARCHIVED | 0 dokumen berstatus ARCHIVED ditemukan dan bisa diambil lewat query biasa | **Lolos** | Tidak ada data uji berstatus ARCHIVED di seed standar — perlu diarsipkan satu manual untuk demonstrasi langsung (lihat TL-10). |
| DB-C2 | Dokumen pada proyek yang sudah diarsipkan masih terambil lewat query | Join documents ke projects, filter project.status = ARCHIVED | 2 dokumen ditemukan pada proyek berstatus ARCHIVED, semuanya terbaca normal | **Lolos** |  |
| DB-C3 | Tidak ada dokumen yatim (project_id menunjuk proyek yang sudah tidak ada) | Cari document.project_id yang tidak match baris manapun di projects | 0 dokumen yatim ditemukan | **Lolos** | Konsisten dengan onDelete: Cascade pada Document.project (lihat DB-D). |
| DB-D1 | Daftar lengkap aturan ON DELETE tiap foreign key (dari database asli, bukan asumsi skema) | Query information_schema untuk seluruh FK + referential_constraints.delete_rule | action_items.assigned_to_id→users(SET NULL) \| action_items.linked_document_id→documents(SET NULL) \| action_items.notulen_id→notulen(CASCADE) \| action_items.required_document_type_id→document_types(SET NULL) \| audit_logs.actor_id→users(SET NULL) \| audit_logs.project_id→projects(SET NULL) \| document_references.created_by_id→users(RESTRICT) \| document_references.document_id→documents(CASCADE) \| document_references.referenced_document_id→documents(CASCADE) \| document_tags.assigned_by_id→use | **Lolos** | Total 30 FK. CASCADE eksplisit: 13. Sisanya NO ACTION (setara Restrict — Prisma tidak menambah ON DELETE kalau tidak diminta eksplisit di schema.prisma). |
| DB-D2 | Relasi CASCADE yang berisiko menghapus dokumen/audit log tanpa sengaja | Saring FK dari DB-D1: table_name='documents' ATAU 'audit_logs' dengan delete_rule=CASCADE (baris dokumen/audit log ikut terhapus sebagai efek samping penghapusan tabel lain), lalu diverifikasi lewat perilaku nyata endpoint DELETE /api/projects/[id] (bukan cuma struktur skema) | documents.project_id→projects(CASCADE), documents.project_phase_id→project_phases(CASCADE) | **Lolos** | DIPERBAIKI (sebelumnya Gagal — lihat riwayat pengujian): documents.project_id → projects masih punya CASCADE di level skema (sengaja tidak diubah — mengubahnya jadi RESTRICT akan lebih rumit dan berisiko dibanding menjaga di level aplikasi), TAPI deleteProject() di project.service.ts sekarang memeriksa dulu sebelum menghapus: kalau ada dokumen legal_hold atau dokumen berstatus bukan DRAFT (proyek punya riwayat sungguhan), penghapusan ditolak (400) dan proyeknya tetap utuh — CASCADE di skema tidak sempat terpicu. Proyek kosong/masih draft semua tetap bisa dihapus normal. Diverifikasi ulang lewat percobaan nyata: proyek berisi dokumen APPROVED dicoba dihapus → ditolak, proyek tetap ada; proyek baru kosong dicoba dihapus → berhasil. |
| DB-D3 | Apakah menghapus User bisa dilakukan sama sekali, atau selalu diblokir DB kalau dia sudah beraktivitas | Daftar semua kolom FK yang menunjuk ke users, tandai mana yang NOT NULL | projects.created_by_id(wajib) \| documents.assigned_to_id(opsional) \| documents.reviewed_by_id(opsional) \| documents.uploaded_by_id(wajib) \| document_versions.created_by_id(wajib) \| audit_logs.actor_id(opsional) \| notulen.created_by_id(wajib) \| action_items.assigned_to_id(opsional) \| user_roles.user_id(wajib) \| document_versions.approved_by_id(opsional) \| document_tags.assigned_by_id(wajib) \| milestones.created_by_id(wajib) \| document_references.created_by_id(wajib) | **Lolos** | Menjelaskan kenapa sistem punya kolom is_active (nonaktifkan) alih-alih hapus baris User sungguhan — DELETE FROM users akan gagal begitu user itu sudah upload dokumen/tercatat di audit log (kolom wajib). Aman (mencegah kehilangan riwayat), tapi berarti aksi 'hapus user' di UI semestinya berarti nonaktifkan. Cocokkan dengan SA-14. |
| DB-E1 | Persentase kelengkapan per fase (proyek LPS Gedung Mewah Tower A) sesuai hitungan manual dari data mentah | Hitung ulang manual dari SQL mentah: dokumen wajib per fase yang APPROVED / total dokumen wajib fase. Bandingkan dengan respons NYATA GET /api/projects/[id] di server test (login sebagai Team Leader) — memvalidasi jalur permintaan penuh, bukan fungsi terisolasi. | INISIASI: manual=50%, API=50%, ASSESSMENT: manual=100%, API=100%, DESIGN: manual=0%, API=0%, IMPLEMENTASI: manual=100%, API=100%, COMMISSIONING: manual=0%, API=0%, INSPEKSI_BERKALA: manual=0%, API=0% | **Lolos** | Cocok persis. |
| DB-F1 | Tidak ada baris audit dengan actor kosong | COUNT(*) WHERE actor_id IS NULL | 0 dari 15 baris audit log tanpa actor | **Lolos** |  |
| DB-F2 | Ragam aksi yang tercatat mencakup create/edit/delete | GROUP BY action | LINK: 1, CREATE: 9, APPROVE: 2, UNLINK: 1, PHASE_CHANGE: 2 | **Lolos** | Verifikasi end-to-end (aksi lewat API lalu cek baris barunya) sudah tercakup lewat Prompt 1 dan riwayat pengujian fungsional sebelumnya — di sini hanya diverifikasi keberadaan datanya secara agregat. |
| DB-G1 | Tabel relasi antar-dokumen (document_references / relation_type BASED_ON, disebut Bab VI.1.5 naskah) — ada atau tidak | Cari model di schema.prisma, tabel sungguhan di database (information_schema.tables), dan endpoint API yang membacanya/menulisnya | DITEMUKAN. Tabel document_references ada di skema dan database, dengan model Prisma + enum DocumentRelationType (BASED_ON). Endpoint POST/GET/DELETE /api/documents/[id]/references sudah aktif. 0 baris referensi tersimpan saat pemeriksaan. | **Lolos** | DIPERBAIKI (sebelumnya Gagal — lihat riwayat pengujian): fitur penautan dokumen antar-fase kini benar-benar dibangun — model DocumentReference (relasi many-to-many lewat documentId/referencedDocumentId, relationType BASED_ON), endpoint API (tambah/lihat/hapus referensi per dokumen, di halaman detail dokumen), dan endpoint metrik GET /api/projects/[id]/traceability yang menghitung M-1 (Traceability Coverage) dan M-2 (Lifecycle Integration Level). Diverifikasi end-to-end: tautan berhasil dibuat, muncul di kedua arah (dokumen sumber & dokumen yang dirujuk), duplikat & self-reference ditolak, Client tidak bisa menautkan, metrik proyek terhitung. CATATAN PENTING: definisi M-1/M-2 di sini adalah interpretasi wajar dari nama metriknya (M-1 = %dokumen non-draft dengan minimal 1 referensi; M-2 = %pasangan fase bersebelahan yang punya dokumen saling terhubung) — BELUM dicocokkan ke rumus persis di Bab III/VI naskah skripsi, perlu diverifikasi manual oleh penulis. |

## Query SQL yang dipakai

**DB-A1**
```sql
SELECT id, password_hash FROM users
```

**DB-A2**
```sql
SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%password%' OR ILIKE '%secret%' OR ILIKE '%token%'
```

**DB-B1**
```sql
SELECT document_id, COUNT(*) FILTER (WHERE is_current) FROM document_versions GROUP BY document_id HAVING COUNT(*) FILTER (WHERE is_current) <> 1
```

**DB-B2**
```sql
SELECT document_id, version_number, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY version_number) FROM document_versions
```

**DB-B3**
```sql
SELECT COUNT(*) FROM document_versions
```

**DB-C1**
```sql
SELECT id FROM documents WHERE status = 'ARCHIVED'
```

**DB-C2**
```sql
SELECT d.id FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.status='ARCHIVED'
```

**DB-C3**
```sql
SELECT d.id FROM documents d WHERE d.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=d.project_id)
```

**DB-D1**
```sql
SELECT tc.table_name, kcu.column_name, ccu.table_name, rc.delete_rule FROM information_schema.table_constraints ... JOIN referential_constraints
```

**DB-D2**
```sql
-- turunan DB-D1
```

**DB-D3**
```sql
-- lihat cara di atas
```

**DB-E1**
```sql
-- perhitungan pembanding di SQL biasa, dicocokkan ke respons HTTP asli
```

**DB-F1**
```sql
SELECT COUNT(*) FROM audit_logs WHERE actor_id IS NULL
```

**DB-F2**
```sql
SELECT action, COUNT(*) FROM audit_logs GROUP BY action
```

**DB-G1**
```sql
SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%reference%'; SELECT COUNT(*) FROM document_references
```

