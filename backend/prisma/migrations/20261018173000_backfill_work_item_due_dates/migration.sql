-- Every task displayed in the dashboard must have a due date. Existing records
-- created before due dates became mandatory receive a seven-day default.
UPDATE "work_items"
SET "due_at" = "created_at" + INTERVAL '7 days'
WHERE "due_at" IS NULL;
