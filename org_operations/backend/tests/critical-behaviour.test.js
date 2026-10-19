const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { prisma } = require("../dist/lib/prisma.js");
const { hasTeamRole } = require("../dist/modules/teams/team-access.js");

const runId = crypto.randomUUID();
let team;
let creator;
let claimantA;
let claimantB;

before(async () => {
  team = await prisma.team.create({
    data: { name: `Test Team ${runId}`, slug: `test-${runId}` },
  });
  const passwordHash = "not-used-by-these-tests";
  [creator, claimantA, claimantB] = await Promise.all(
    ["creator", "claimant-a", "claimant-b"].map((name) =>
      prisma.user.create({
        data: {
          fullName: name,
          email: `${name}-${runId}@example.test`,
          passwordHash,
        },
      })
    )
  );
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { workItem: { teamId: team.id } } });
  await prisma.comment.deleteMany({ where: { workItem: { teamId: team.id } } });
  await prisma.workItem.deleteMany({ where: { teamId: team.id } });
  await prisma.team.delete({ where: { id: team.id } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${runId}@example.test` } } });
  await prisma.$disconnect();
});

test("department role hierarchy keeps Employee below Manager", () => {
  assert.equal(hasTeamRole("MEMBER", "MANAGER"), false);
  assert.equal(hasTeamRole("MANAGER", "MEMBER"), true);
});

test("an atomic claim permits exactly one concurrent claimant", async () => {
  const item = await prisma.workItem.create({
    data: { teamId: team.id, creatorId: creator.id, title: "Concurrent claim test" },
  });
  const [first, second] = await Promise.all([
    prisma.workItem.updateMany({
      where: { id: item.id, assigneeId: null, status: "Open" },
      data: { assigneeId: claimantA.id, status: "In Progress", version: { increment: 1 } },
    }),
    prisma.workItem.updateMany({
      where: { id: item.id, assigneeId: null, status: "Open" },
      data: { assigneeId: claimantB.id, status: "In Progress", version: { increment: 1 } },
    }),
  ]);
  assert.equal(first.count + second.count, 1);
  const stored = await prisma.workItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.ok([claimantA.id, claimantB.id].includes(stored.assigneeId));
});

test("optimistic concurrency rejects one of two stale updates", async () => {
  const item = await prisma.workItem.create({
    data: { teamId: team.id, creatorId: creator.id, title: "Stale update test" },
  });
  const [first, second] = await Promise.all([
    prisma.workItem.updateMany({
      where: { id: item.id, version: 1 },
      data: { priority: "High", version: { increment: 1 } },
    }),
    prisma.workItem.updateMany({
      where: { id: item.id, version: 1 },
      data: { priority: "Critical", version: { increment: 1 } },
    }),
  ]);
  assert.equal(first.count + second.count, 1);
});

test("a repeated idempotency key creates only one work item", async () => {
  const idempotencyKey = crypto.randomUUID();
  const create = () => prisma.workItem.create({
    data: {
      teamId: team.id,
      creatorId: creator.id,
      title: "Idempotent create test",
      idempotencyKey,
    },
  });
  const results = await Promise.allSettled([create(), create()]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const count = await prisma.workItem.count({
    where: { teamId: team.id, creatorId: creator.id, idempotencyKey },
  });
  assert.equal(count, 1);
});
