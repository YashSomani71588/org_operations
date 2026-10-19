-- Blocked is no longer part of the supported workflow. Preserve active work by
-- moving any existing blocked records back into progress.
UPDATE "work_items"
SET "status" = 'In Progress'
WHERE "status" = 'Blocked';
