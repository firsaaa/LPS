-- AlterTable
ALTER TABLE "action_items" ADD COLUMN     "linked_document_id" TEXT;

-- AlterTable
ALTER TABLE "notulen" ADD COLUMN     "file_path" TEXT;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
