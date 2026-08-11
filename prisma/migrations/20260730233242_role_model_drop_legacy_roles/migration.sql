-- DropForeignKey
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_user_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "global_role";

-- DropTable
DROP TABLE "project_members";

-- DropEnum
DROP TYPE "GlobalRole";

-- DropEnum
DROP TYPE "ProjectRole";

