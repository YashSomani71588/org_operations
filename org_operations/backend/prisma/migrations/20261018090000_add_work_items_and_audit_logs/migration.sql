-- Preserve existing accounts while aligning the original table with @@map("users").
ALTER TABLE "User" RENAME TO "users";
ALTER TABLE "users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
ALTER INDEX "User_email_key" RENAME TO "users_email_key";
ALTER INDEX "User_role_idx" RENAME TO "users_role_idx";

CREATE TABLE "work_items" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "team" TEXT NOT NULL DEFAULT 'Operations',
    "creatorId" UUID,
    "assigneeId" UUID,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "resolutionProposal" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "work_item_id" INTEGER NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_items_status_idx" ON "work_items"("status");
CREATE INDEX "work_items_priority_idx" ON "work_items"("priority");
CREATE INDEX "work_items_team_idx" ON "work_items"("team");

ALTER TABLE "work_items"
    ADD CONSTRAINT "work_items_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_items"
    ADD CONSTRAINT "work_items_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
