-- Preserve work while consolidating the organization to three departments.
UPDATE "work_items"
SET "team_id" = '00000000-0000-4000-8000-000000000104'
WHERE "team_id" IN (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000105'
);

DELETE FROM "team_memberships"
WHERE "team_id" IN (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000105'
);

DELETE FROM "teams"
WHERE "id" IN (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000105'
);

UPDATE "teams"
SET "name" = 'Finance', "slug" = 'finance', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-4000-8000-000000000102';

UPDATE "teams"
SET "name" = 'Engineers', "slug" = 'engineers', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-4000-8000-000000000103';

-- There is exactly one global administrator account.
UPDATE "users"
SET "role" = 'EMPLOYEE'
WHERE "role" = 'ADMIN' AND "email" <> 'admin@company.com';
