# LPS EDMS

Electronic Document Management System untuk proyek instalasi **Lightning Protection System (LPS)**, dibangun mengikuti alur kerja dokumen sesuai standar **IEC 62305**. Tugas Akhir — Sistem Informasi.

## Apa yang dikerjakan sistem ini

Proyek LPS melewati 6 fase (Inisiasi → Assessment → Design → Implementasi → Commissioning → Inspeksi Berkala), masing-masing dengan dokumen wajibnya sendiri (kontrak, laporan risiko, desain, rolling sphere, grounding layout, as-built drawing, dst — 13 tipe dokumen). Sistem ini melacak dokumen-dokumen itu lewat siklus hidupnya (Draft → Diajukan Review → Disetujui/Perlu Revisi/Ditolak → Diarsipkan), mengatur siapa yang boleh melihat apa, dan menyimpan riwayat rapat/tindak lanjut per proyek.

**Role & kewenangan:**
| Role | Cakupan | Bisa apa |
|---|---|---|
| Super Admin | Seluruh sistem | Kelola user, tetapkan Team Leader, awasi semua proyek — tidak ikut alur kerja dokumen |
| Team Leader | Per proyek | Kelola tim & fase, upload/approve/reject dokumen, atur visibilitas, milestone, notulen |
| Engineer | Per proyek | Upload & submit dokumen ke fase aktif |
| Inspector | Lintas proyek, global | Meninjau kepatuhan dokumen ke IEC 62305 — murni pengawasan, tidak memutuskan approval |
| Client | Per proyek, eksternal | Portal Client — hanya melihat dokumen yang sudah Disetujui & ditandai untuk klien |

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + TypeScript
- **PostgreSQL** + **Prisma 7** (`@prisma/adapter-pg`)
- **NextAuth v5** (credentials, JWT session)
- Tailwind CSS, Radix UI primitives
- Ekstraksi teks (PDF/DOCX/XLSX/PPTX) + OCR (tesseract.js) untuk pencarian isi dokumen
- Vitest untuk unit test

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env      # isi DATABASE_URL ke Postgres lokal kamu
npx prisma migrate deploy
npm run db:seed           # akun demo — lihat tabel di bawah
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### Akun demo (dari `db:seed`)

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@lps-edms.com | admin123 |
| Team Leader | budi.leader@lps-edms.com | password123 |
| Engineer | rina.engineer@lps-edms.com | password123 |
| Inspector | dhani.inspector@lps-edms.com | password123 |
| Client | client@gedungmewah.com | password123 |

## Struktur singkat

```
prisma/schema.prisma        skema DB — sumber kebenaran untuk semua model & relasi
prisma/seed.ts               data demo untuk development/testing
src/app/                     routes (App Router) — (auth), (main), api/
src/components/               UI per fitur (projects, documents, inspector, client-portal, dll)
src/lib/services/             business logic (document, project, milestone, notulen, dashboard, dll)
src/lib/api-helpers.ts        helper otorisasi & response yang dipakai semua route
tests/unit/                   unit test
```