-- CreateEnum
CREATE TYPE "DocumentRelationType" AS ENUM ('BASED_ON');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LINK';
ALTER TYPE "AuditAction" ADD VALUE 'UNLINK';

-- CreateTable
CREATE TABLE "document_references" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "referenced_document_id" TEXT NOT NULL,
    "relation_type" "DocumentRelationType" NOT NULL DEFAULT 'BASED_ON',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_references_referenced_document_id_idx" ON "document_references"("referenced_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_references_document_id_referenced_document_id_rela_key" ON "document_references"("document_id", "referenced_document_id", "relation_type");

-- AddForeignKey
ALTER TABLE "document_references" ADD CONSTRAINT "document_references_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_references" ADD CONSTRAINT "document_references_referenced_document_id_fkey" FOREIGN KEY ("referenced_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_references" ADD CONSTRAINT "document_references_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
