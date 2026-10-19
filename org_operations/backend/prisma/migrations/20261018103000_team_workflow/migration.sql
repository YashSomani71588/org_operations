CREATE TYPE "TeamRole" AS ENUM ('VIEWER', 'MEMBER', 'MANAGER');

CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

INSERT INTO "teams" ("id", "name", "slug", "updated_at") VALUES
('00000000-0000-4000-8000-000000000101', 'Payments', 'payments', CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000102', 'Finance Ops', 'finance-ops', CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000103', 'Engineering', 'engineering', CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000104', 'Operations', 'operations', CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000105', 'Compliance', 'compliance', CURRENT_TIMESTAMP);

CREATE TABLE "team_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

INSERT INTO "team_memberships" ("id", "user_id", "team_id", "role", "updated_at")
SELECT gen_random_uuid(), u."id", t."id",
       CASE WHEN u."role" = 'ADMIN' THEN 'MANAGER'::"TeamRole" ELSE 'MEMBER'::"TeamRole" END,
       CURRENT_TIMESTAMP
FROM "users" u CROSS JOIN "teams" t;

CREATE UNIQUE INDEX "team_memberships_user_id_team_id_key" ON "team_memberships"("user_id", "team_id");
CREATE INDEX "team_memberships_team_id_role_idx" ON "team_memberships"("team_id", "role");

ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_items"
    ADD COLUMN "category" VARCHAR(120) NOT NULL DEFAULT 'General',
    ADD COLUMN "team_id" UUID,
    ADD COLUMN "resolution" TEXT,
    ADD COLUMN "approved_by_id" UUID,
    ADD COLUMN "approved_at" TIMESTAMP(3),
    ADD COLUMN "idempotency_key" VARCHAR(100);

UPDATE "work_items" w
SET "team_id" = t."id"
FROM "teams" t
WHERE t."name" = w."team";

UPDATE "work_items"
SET "team_id" = '00000000-0000-4000-8000-000000000104'
WHERE "team_id" IS NULL;

ALTER TABLE "work_items" ALTER COLUMN "team_id" SET NOT NULL;
ALTER TABLE "work_items" DROP COLUMN "team";

DROP INDEX IF EXISTS "work_items_status_idx";
DROP INDEX IF EXISTS "work_items_priority_idx";
DROP INDEX IF EXISTS "work_items_team_idx";

CREATE UNIQUE INDEX "work_items_creatorId_team_id_idempotency_key_key"
    ON "work_items"("creatorId", "team_id", "idempotency_key");
CREATE INDEX "work_items_team_id_status_updated_at_idx"
    ON "work_items"("team_id", "status", "updated_at");
CREATE INDEX "work_items_team_id_assigneeId_status_idx"
    ON "work_items"("team_id", "assigneeId", "status");
CREATE INDEX "work_items_team_id_priority_idx"
    ON "work_items"("team_id", "priority");
CREATE INDEX "work_items_due_at_idx" ON "work_items"("due_at");

ALTER TABLE "work_items" ADD CONSTRAINT "work_items_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "work_item_id" INTEGER NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comments_work_item_id_created_at_idx" ON "comments"("work_item_id", "created_at");
ALTER TABLE "comments" ADD CONSTRAINT "comments_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
