CREATE TABLE "notifications" (
  "id" SERIAL NOT NULL,
  "user_id" UUID NOT NULL,
  "work_item_id" INTEGER,
  "type" VARCHAR(60) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "message" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_read_at_created_at_idx"
ON "notifications"("user_id", "read_at", "created_at");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_work_item_id_fkey"
FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
