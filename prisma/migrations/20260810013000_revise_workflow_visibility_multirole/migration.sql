-- AuditAction: add REJECT, ARCHIVE for the new workflow actions
ALTER TYPE "AuditAction" ADD VALUE 'REJECT';
ALTER TYPE "AuditAction" ADD VALUE 'ARCHIVE';

-- DocumentStatus: DRAFT -> UNDER_REVIEW -> APPROVED -> ARCHIVED, with
-- REVISION_REQUESTED/REJECTED as review outcomes. SUBMITTED is removed —
-- existing SUBMITTED rows collapse into UNDER_REVIEW (closest match: both
-- meant "waiting on a reviewer").
BEGIN;
CREATE TYPE "DocumentStatus_new" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'ARCHIVED');
ALTER TABLE "documents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "status" TYPE "DocumentStatus_new"
  USING (CASE "status"::text WHEN 'SUBMITTED' THEN 'UNDER_REVIEW' ELSE "status"::text END)::"DocumentStatus_new";
ALTER TYPE "DocumentStatus" RENAME TO "DocumentStatus_old";
ALTER TYPE "DocumentStatus_new" RENAME TO "DocumentStatus";
DROP TYPE "DocumentStatus_old";
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DocumentVisibility: 2 tiers -> 4-tier hierarchy (see enum comment in schema).
-- INTERNAL -> PROJECT_TEAM and CLIENT_VISIBLE -> CLIENT_ACCESSIBLE preserve
-- the exact same visible audience as before the change for existing documents;
-- INTERNAL_ONLY/AUDITOR are new, narrower/intermediate tiers a Team Leader can
-- newly opt individual documents into.
BEGIN;
CREATE TYPE "DocumentVisibility_new" AS ENUM ('INTERNAL_ONLY', 'PROJECT_TEAM', 'AUDITOR', 'CLIENT_ACCESSIBLE');
ALTER TABLE "documents" ALTER COLUMN "visibility" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "visibility" TYPE "DocumentVisibility_new"
  USING (CASE "visibility"::text WHEN 'INTERNAL' THEN 'PROJECT_TEAM' WHEN 'CLIENT_VISIBLE' THEN 'CLIENT_ACCESSIBLE' ELSE "visibility"::text END)::"DocumentVisibility_new";
ALTER TYPE "DocumentVisibility" RENAME TO "DocumentVisibility_old";
ALTER TYPE "DocumentVisibility_new" RENAME TO "DocumentVisibility";
DROP TYPE "DocumentVisibility_old";
ALTER TABLE "documents" ALTER COLUMN "visibility" SET DEFAULT 'PROJECT_TEAM';
COMMIT;

-- Multi-role: allow more than one role per (user, project) — same invariant
-- change as addProjectMember() in project.service.ts, just making the DB
-- constraint match (it already permitted this; nothing to alter here, the
-- @@unique([userId, projectId, role]) constraint was already role-inclusive).
