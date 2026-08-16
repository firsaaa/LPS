# Orientasi Sistem — LPS EDMS

Disiapkan sebelum pengujian dijalankan (Prompt 0). Sumber: pembacaan langsung kode di repo ini, bukan asumsi.

## 1. Route API, dikelompokkan per sumber daya

### Proyek
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/projects` | Daftar proyek. Query: `filter` (leader/engineer/inspector/client/all) |
| POST | `/api/projects` | Buat proyek baru. Hanya `canLeadProject=true` (lihat §2) |
| GET | `/api/projects/[id]` | Detail proyek + fase + dokumen (difilter visibilitas & status per viewer) |
| PATCH | `/api/projects/[id]` | Ubah metadata proyek |
| DELETE | `/api/projects/[id]` | *(ada handler-nya, cek perilaku aktual di Prompt 1)* |
| GET/POST/DELETE | `/api/projects/[id]/members` | Kelola anggota tim |
| GET/PATCH | `/api/projects/[id]/phases` | Fase proyek (aktivasi/skip) |
| GET/POST | `/api/projects/[id]/documents` | Dokumen per proyek + upload |
| POST | `/api/projects/[id]/documents/assign` | Team Leader menugaskan dokumen ke Engineer |
| GET/POST | `/api/projects/[id]/notulen` | Notulen rapat per proyek |
| GET/POST | `/api/projects/[id]/milestones` | Milestone per proyek |

### Dokumen
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/documents` | — |
| GET | `/api/documents/search` | Pencarian lanjutan (judul, kode, tag, ISI berkas, tanggal, uploader) |
| GET | `/api/documents/[id]` | Detail dokumen |
| DELETE | `/api/documents/[id]` | Hapus (DRAFT) atau arsipkan (selain DRAFT) |
| PUT | `/api/documents/[id]/status` | Ubah status versi aktif |
| PUT | `/api/documents/[id]/visibility` | Ubah visibilitas |
| POST | `/api/documents/[id]/approve` | Aksi alur kerja: `submit\|approve\|revise\|reject\|archive` (body `{action}`) |
| GET/POST | `/api/documents/[id]/version` | Riwayat versi / unggah versi baru |
| POST/DELETE | `/api/documents/[id]/tags` | Tag dokumen |
| GET | `/api/document-type-master`, `/api/document-types` | Master 14 tipe dokumen |
| GET | `/api/files/[...path]` | Serve berkas — **satu-satunya jalur baca isi berkas**, gerbang otorisasi utama untuk kebocoran file (lihat §2) |

### Pengguna
| Method | Endpoint | Keterangan |
|---|---|---|
| GET/POST | `/api/users` | Daftar (semua user login) / buat user baru (Superadmin saja) |
| GET/PATCH/DELETE | `/api/users/[id]` | Detail/ubah/nonaktifkan user |

### Notulen & Notifikasi
| Method | Endpoint | Keterangan |
|---|---|---|
| PATCH | `/api/notulen/[notulenId]` | Edit notulen |
| POST | `/api/notulen/[notulenId]/action-items/[itemId]/close` | Tutup/buka kembali tindak lanjut |
| GET | `/api/notifications`, `/api/notifications/unread-count` | — |
| PATCH | `/api/notifications/[id]/read`, `/api/notifications/read-all` | — |
| GET | `/api/me/tasks` | Dokumen ditugaskan + tindak lanjut terbuka milik viewer |

### Kepatuhan & Lintas Proyek
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/dashboard` | Ringkasan per-proyek (pending review, missing docs, cadence) — **digate per role, lihat §2** |
| GET | `/api/laporan` | Laporan agregat (groupBy di level DB, bukan fetch-all) — digate sama seperti dashboard |
| GET | `/api/audit-logs` | Riwayat aktivitas |
| GET | `/api/tags` | — |
| GET/POST | `/api/templates`, `/api/templates/submit` | **Stub — submit selalu membalas 410, fitur di luar cakupan** |
| GET/PUT/POST | `/api/completeness-requests` | *(belum diverifikasi cakupannya — cek saat Prompt 1)* |

## 2. Autentikasi & otorisasi

**Tidak ada RBAC terpusat di middleware.** `src/proxy.ts` (edge) hanya memeriksa satu hal: ada/tidaknya sesi valid (`getToken()`). Kalau tidak ada sesi → redirect `/login` (halaman) atau lolos ke route handler yang lalu membalas 401 sendiri (API). **Middleware tidak tahu apa-apa soal role.**

Setiap route handler memanggil `getSessionUser()` (dari `src/lib/api-helpers.ts`) sendiri-sendiri untuk otorisasi, dengan pola yang konsisten:
```ts
const user = await getSessionUser();
if (!user) return unauthorized();
const role = await getUserProjectRole(user.id, projectId); // atau getUserProjectRoles() untuk multi-role
if (!role || role !== "TEAM_LEADER") return forbidden();
```
Ini **desain yang disengaja** (dicatat di komentar kode: multi-role per proyek nyata perlu resolusi per-proyek, bukan satu flag global) — tapi konsekuensinya, konsistensi antar 35 route handler tidak dijamin oleh satu lapisan tunggal. Ini alasan Prompt 1 (pengujian API langsung) penting: kalau satu route lupa memanggil pemeriksaan ini, tidak ada jaring pengaman lain yang menangkapnya.

Titik-titik otorisasi yang secara khusus perlu diuji karena riwayatnya rawan (sudah pernah ditemukan bug serupa dalam pengembangan):
- `/api/files/[...path]` — resolve dulu dokumen/notulen pemilik berkas, baru panggil `canViewDocument(role, visibility, status)`. Kalau resolusinya gagal mengenali suatu path, ada jalur fallback yang lebih longgar.
- `/api/dashboard`, `/api/laporan` — punya gate eksplisit untuk role CLIENT (widget disembunyikan di level data, bukan cuma UI) karena pernah ditemukan bocor.
- `canViewDocument()` di `src/lib/services/document.service.ts:35` menggabungkan DUA syarat: tier visibilitas (`VISIBILITY_VIEWERS`, baris 18) DAN status APPROVED khusus untuk role CLIENT (`requiresApprovedOnly()`, baris 31). INSPECTOR sengaja TIDAK kena syarat status karena tugasnya meninjau dokumen yang belum disetujui.

## 3. Skema Prisma — model, relasi, `onDelete`

14 model: `User, Project, Milestone, UserRole, ProjectPhase, PhaseRequiredDocument, DocumentTypeMaster, Document, DocumentVersion, Tag, DocumentTag, AuditLog, Notulen, ActionItem`.

`onDelete` eksplisit (`Cascade` semua):
- `Milestone.project`, `UserRole.project`, `ProjectPhase.project`, `Document.project`, `Document.projectPhase`, `DocumentVersion.document`, `DocumentTag.document`, `DocumentTag.tag`, `ActionItem.notulen`, `Notulen.project`

Relasi TANPA `onDelete` eksplisit (pakai default Prisma — perlu diverifikasi perilaku sebenarnya di database lewat Prompt 2, bukan diasumsikan dari skema saja): `Document.uploadedBy/assignedTo/reviewedBy/documentTypeMaster`, `DocumentVersion.createdBy/approvedBy`, `ActionItem.assignedTo/requiredDocumentType/linkedDocument`, `AuditLog.actor`, `Notulen.createdBy`.

Yang paling penting diverifikasi: **apakah menghapus User bisa mengosongkan/merusak riwayat dokumen atau audit log**, karena tidak ada `onDelete: Cascade` eksplisit pada relasi User manapun (artinya sengaja dijaga, tapi perlu dibuktikan, bukan diasumsikan).

## 4. Indeks yang sudah ada

```
UserRole:        @@unique([userId, projectId, role])
ProjectPhase:     @@unique([projectId, phase])
Document:         @@index([projectId, documentTypeId])
                   @@index([projectPhaseId, createdAt])
                   @@index([status, updatedAt])
                   @@index([assignedToId, status])
                   @@index([contentTsv], type: Gin)   ← full-text search
DocumentVersion:  @@unique([documentId, versionNumber])
                   @@index([documentId, isCurrent])
```
Kolom yang DISEBUT di Prompt 3 sebagai kandidat indeks (`project_id, phase, status, uploaded_by, created_at`) — `projectId`+`status`+`createdAt` pada Document sudah tercakup index komposit di atas; `uploadedById` (tanpa index) dan `phase` pada `ProjectPhase` (tanpa index sendiri, hanya bagian dari `@@unique`) adalah kandidat yang belum tentu perlu — diputuskan lewat EXPLAIN ANALYZE nyata di Prompt 3, bukan ditambah asal duga.

## 5. Lokasi logika kunci

| Logika | Berkas : baris | Catatan |
|---|---|---|
| Persentase kelengkapan dokumen per fase | `src/lib/services/project.service.ts:65` (`attachCompleteness`) | Fungsi murni, dihitung dari data yang sudah di-fetch — bukan query agregat terpisah per fase |
| Transisi status dokumen | `src/app/api/documents/[id]/approve/route.ts:19` (`VALID_TRANSITIONS`) + `document.service.ts:278` (`updateDocumentStatus`) | Alur: DRAFT→UNDER_REVIEW→APPROVED/REVISION_REQUESTED/REJECTED→ARCHIVED. Divalidasi di route sebelum dieksekusi di service |
| Penyaringan visibilitas | `document.service.ts:18` (`VISIBILITY_VIEWERS`), `:31` (`requiresApprovedOnly`), `:35` (`canViewDocument`), `:43` (`visibilityAllowlist`) | Satu fungsi dipakai berulang di 6+ pemanggil (route dokumen, route file, project.service, search) |
| Pencarian dokumen + isi berkas | `document.service.ts:138` (`searchDocuments`), `:553` (`advancedSearchDocuments`) | Isi berkas dicari lewat kolom `content_tsv` (generated tsvector + index GIN), bukan `ILIKE` — lihat §4 |

## Catatan metodologis

Ini bacaan kode (**white box**) untuk mengarahkan pengujian — bukan pengujian itu sendiri. Prompt 1 (API) tetap murni **black box**: dikirim ke endpoint sebagai klien biasa, tanpa bergantung pada pemahaman ini untuk menilai lolos/gagalnya. Prompt 2 (integritas basis data) dan §3–4 di atas adalah **white box**, karena memang membaca struktur internal.
