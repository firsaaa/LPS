-- DropForeignKey
ALTER TABLE "document_field_values" DROP CONSTRAINT "document_field_values_document_id_fkey";

-- DropTable
DROP TABLE "document_field_values";

-- DropEnum
DROP TYPE "DataType";
