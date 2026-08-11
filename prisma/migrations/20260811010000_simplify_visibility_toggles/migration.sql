-- DocumentVisibility: replace the 4-tier ranked hierarchy with a simple
-- baseline (INTERNAL = Team Leader + Engineer) plus two independent additive
-- toggles (Auditor, Client) — see enum comment in schema.prisma.
-- Mapping preserves each existing document's actual audience:
--   INTERNAL_ONLY (was Team Leader only)        -> INTERNAL (closest available; baseline is now always TL+Engineer)
--   PROJECT_TEAM  (was Team Leader + Engineer)   -> INTERNAL (exact match)
--   AUDITOR       (was + Inspector)              -> AUDITOR_ACCESSIBLE (exact match)
--   CLIENT_ACCESSIBLE (was top tier = everyone)  -> ALL_ACCESSIBLE (exact match)
BEGIN;
CREATE TYPE "DocumentVisibility_new" AS ENUM ('INTERNAL', 'AUDITOR_ACCESSIBLE', 'CLIENT_ACCESSIBLE', 'ALL_ACCESSIBLE');
ALTER TABLE "documents" ALTER COLUMN "visibility" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "visibility" TYPE "DocumentVisibility_new"
  USING (
    CASE "visibility"::text
      WHEN 'INTERNAL_ONLY' THEN 'INTERNAL'
      WHEN 'PROJECT_TEAM' THEN 'INTERNAL'
      WHEN 'AUDITOR' THEN 'AUDITOR_ACCESSIBLE'
      WHEN 'CLIENT_ACCESSIBLE' THEN 'ALL_ACCESSIBLE'
      ELSE "visibility"::text
    END
  )::"DocumentVisibility_new";
ALTER TYPE "DocumentVisibility" RENAME TO "DocumentVisibility_old";
ALTER TYPE "DocumentVisibility_new" RENAME TO "DocumentVisibility";
DROP TYPE "DocumentVisibility_old";
ALTER TABLE "documents" ALTER COLUMN "visibility" SET DEFAULT 'INTERNAL';
COMMIT;
