-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "project_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

