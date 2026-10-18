# OpsFlow - Operations Under Pressure

OpsFlow is a team-based operational work system built for the Newtonite Software Engineering Challenge.

## Stack

- Next.js 16 + React + TypeScript frontend
- Node.js + Express + TypeScript API
- PostgreSQL + Prisma 7
- Zod request validation

The backend is intentionally TypeScript. NestJS was considered, but retaining the smaller Express API allowed the assessment time to be spent on authorization, concurrency, idempotency, workflow consistency, and tests.

## Run locally

Requirements: Node.js, npm, and Docker.

```bash
cd backend
npm install
npm run db:up
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The API is available at http://localhost:4000.

Seeded accounts use password `password123`:

- Global administrator: `admin@company.com`
- Operations manager: `operations.manager1@company.com`
- Operations employee: `operations.employee1@company.com`
- Operations viewer: `operations.viewer@company.com`
- Finance manager: `finance.manager1@company.com`
- Finance employee: `finance.employee1@company.com`
- Finance viewer: `finance.viewer@company.com`
- Engineers manager: `engineers.manager1@company.com`
- Engineers employee: `engineers.employee1@company.com`
- Engineers viewer: `engineers.viewer@company.com`

Each department has two managers, four employees, and one viewer. Additional seeded accounts use the same email pattern with `manager2` or `employee2` through `employee4`.

See [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md) for the complete account list.

### Access rules

- The global administrator can see and manage all three departments.
- Department managers can create and assign work only in their department.
- Employees can view and claim unassigned work in their department, but cannot create work.
- Viewers have read-only access to their department.
- Claimed or assigned work cannot be claimed or assigned to another employee.

## Verification

```bash
cd backend
npm test
npm run typecheck

cd ../frontend
npm run lint
npm run build
```

## Critical behavior demonstrated

1. Atomic claim: concurrent claimers cannot both win.
2. Stale-edit rejection: versioned updates use database compare-and-swap.
3. Idempotent creation: repeated submissions return one work item.
4. Resource authorization: roles are evaluated per team on every protected operation.

## Main API routes

- `GET /api/teams` - teams available to the signed-in user
- `GET /api/work-items?teamId=...` - paginated server-side search and filtering
- `POST /api/work-items` - idempotent creation using the `Idempotency-Key` header
- `POST /api/work-items/:id/claim` - atomic ownership claim
- `PATCH /api/work-items/:id` - versioned owner/manager edit
- `GET /api/work-items/:id` - summary, comments, activity, and viewer role
- `POST /api/work-items/:id/comments` - append a collaboration note
- `POST /api/work-items/:id/request-approval` - freeze details and request review
- `POST /api/work-items/:id/approve` or `/request-changes` - manager decision
- `POST /api/work-items/:id/resolve` - direct resolution when approval is not required

See [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md) and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for trade-offs and follow-up work.
