-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "client_sees_all_documents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inspector_sees_all_documents" BOOLEAN NOT NULL DEFAULT true;
