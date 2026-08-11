-- AlterTable
ALTER TABLE "action_items" ADD COLUMN     "required_document_type_id" TEXT,
ADD COLUMN     "required_phase" "LpsPhase";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "content_text" TEXT;

-- AlterTable
ALTER TABLE "project_phases" ADD COLUMN     "upload_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_required_document_type_id_fkey" FOREIGN KEY ("required_document_type_id") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

