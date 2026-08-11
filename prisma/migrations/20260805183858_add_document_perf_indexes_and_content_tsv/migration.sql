-- AlterTable
-- GENERATED ALWAYS AS ... STORED: Postgres recomputes this itself on every
-- insert/update of content_text (including the OCR background job's update),
-- so there is no backfill step and no application code keeps it in sync.
ALTER TABLE "documents" ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content_text", ''))) STORED;

-- CreateIndex
CREATE INDEX "documents_project_phase_id_created_at_idx" ON "documents"("project_phase_id", "created_at");

-- CreateIndex
CREATE INDEX "documents_status_updated_at_idx" ON "documents"("status", "updated_at");

-- CreateIndex
CREATE INDEX "documents_assigned_to_id_status_idx" ON "documents"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "documents_content_tsv_idx" ON "documents" USING GIN ("content_tsv");
