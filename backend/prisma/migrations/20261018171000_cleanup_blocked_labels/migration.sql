-- Remove the retired workflow label from seeded ticket titles and audit details.
UPDATE "work_items"
SET "title" = REPLACE("title", 'Resolve blocked service request', 'Resolve service request')
WHERE "title" LIKE '%Resolve blocked service request%';

UPDATE "audit_logs"
SET "details" = jsonb_set("details", '{status}', '"In Progress"'::jsonb)
WHERE "details" ->> 'status' = 'Blocked';
