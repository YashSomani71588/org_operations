-- Consolidate the retired read-only department role into Employee access.
-- Existing accounts and memberships are preserved.
UPDATE "team_memberships" SET "role" = 'MEMBER' WHERE "role" = 'VIEWER';

ALTER TYPE "TeamRole" RENAME TO "TeamRole_old";
CREATE TYPE "TeamRole" AS ENUM ('MEMBER', 'MANAGER');
ALTER TABLE "team_memberships"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "TeamRole" USING ("role"::text::"TeamRole"),
  ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "TeamRole_old";
