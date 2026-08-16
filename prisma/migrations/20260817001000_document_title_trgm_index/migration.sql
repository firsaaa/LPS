-- Pencarian judul/kode dokumen (keyword contains, lihat advancedSearchDocuments
-- di document.service.ts) memakai ILIKE '%...%' — pola ini tidak bisa dibantu
-- indeks B-tree biasa (wildcard di depan). Terbukti lewat EXPLAIN ANALYZE
-- (Prompt 3d) memindai seluruh tabel documents setiap kali dijalankan,
-- memburuk berbanding lurus dengan jumlah dokumen. Indeks trigram (pg_trgm)
-- adalah satu-satunya cara mempercepat ILIKE '%...%' di Postgres tanpa
-- mengubah semantik pencarian (tetap "mengandung di mana saja", bukan
-- "diawali dengan"). Tidak dimodelkan lewat @@index di schema.prisma karena
-- gin_trgm_ops butuh ekstensi (CREATE EXTENSION) yang tidak dikelola Prisma
-- di proyek ini — dikelola manual di sini, sama seperti indeks GIN content_tsv.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "documents_document_code_trgm_idx" ON "documents" USING gin ("document_code" gin_trgm_ops);
