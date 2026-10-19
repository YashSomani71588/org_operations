const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { app } = require("../dist/server.js");
const { env } = require("../dist/config/env.js");
const { prisma } = require("../dist/lib/prisma.js");

const runId = crypto.randomUUID();
const state = { teams: {}, users: {} };

function cookieFor(user) {
  const token = jwt.sign({ role: user.role, email: user.email }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "1h",
  });
  return `access_token=${token}`;
}

function as(user) {
  const cookie = cookieFor(user);
  return {
    get: (path) => request(app).get(path).set("Cookie", cookie),
    post: (path) => request(app).post(path).set("Cookie", cookie),
    patch: (path) => request(app).patch(path).set("Cookie", cookie),
    delete: (path) => request(app).delete(path).set("Cookie", cookie),
  };
}

async function createItem(teamId, creatorId, overrides = {}) {
  return prisma.workItem.create({
    data: {
      teamId,
      creatorId,
      title: `API test item ${crypto.randomUUID()}`,
      description: "Isolated API authorization test item.",
      dueAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    },
  });
}

before(async () => {
  const [alpha, beta] = await Promise.all([
    prisma.team.create({ data: { name: `Alpha ${runId}`, slug: `alpha-${runId}` } }),
    prisma.team.create({ data: { name: `Beta ${runId}`, slug: `beta-${runId}` } }),
  ]);
  state.teams = { alpha, beta };

  const definitions = [
    ["admin", "ADMIN", true],
    ["alphaManager", "EMPLOYEE", true],
    ["alphaManager2", "EMPLOYEE", true],
    ["betaManager", "EMPLOYEE", true],
    ["alphaEmployee", "EMPLOYEE", true],
    ["alphaEmployee2", "EMPLOYEE", true],
    ["betaEmployee", "EMPLOYEE", true],
    ["inactiveEmployee", "EMPLOYEE", false],
  ];
  for (const [name, role, isActive] of definitions) {
    state.users[name] = await prisma.user.create({
      data: {
        fullName: name,
        email: `${name}-${runId}@example.test`,
        passwordHash: "not-used",
        role,
        isActive,
      },
    });
  }

  await prisma.teamMembership.createMany({
    data: [
      { userId: state.users.alphaManager.id, teamId: alpha.id, role: "MANAGER" },
      { userId: state.users.alphaManager2.id, teamId: alpha.id, role: "MANAGER" },
      { userId: state.users.betaManager.id, teamId: beta.id, role: "MANAGER" },
      { userId: state.users.alphaEmployee.id, teamId: alpha.id, role: "MEMBER" },
      { userId: state.users.alphaEmployee2.id, teamId: alpha.id, role: "MEMBER" },
      { userId: state.users.betaEmployee.id, teamId: beta.id, role: "MEMBER" },
      { userId: state.users.inactiveEmployee.id, teamId: alpha.id, role: "MEMBER" },
    ],
  });
});

after(async () => {
  await prisma.workItem.deleteMany({ where: { teamId: { in: Object.values(state.teams).map((team) => team.id) } } });
  await prisma.team.deleteMany({ where: { id: { in: Object.values(state.teams).map((team) => team.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(state.users).map((user) => user.id) } } });
  await prisma.$disconnect();
});

test("Admin has global access; Manager is department-bound and sees all department work", async () => {
  const alphaItem = await createItem(state.teams.alpha.id, state.users.alphaEmployee.id);
  const betaItem = await createItem(state.teams.beta.id, state.users.betaEmployee.id);

  const adminAlpha = await as(state.users.admin).get(`/api/work-items/${alphaItem.id}`);
  const adminBeta = await as(state.users.admin).get(`/api/work-items/${betaItem.id}`);
  assert.equal(adminAlpha.status, 200);
  assert.equal(adminBeta.status, 200);

  const managerList = await as(state.users.alphaManager)
    .get("/api/work-items")
    .query({ teamId: state.teams.alpha.id, page: 1, pageSize: 20 });
  assert.equal(managerList.status, 200);
  assert.ok(managerList.body.items.some((item) => item.id === alphaItem.id));

  const managerOutside = await as(state.users.alphaManager).get(`/api/work-items/${betaItem.id}`);
  assert.equal(managerOutside.status, 403);
  assert.equal(managerOutside.body.error, "TEAM_ACCESS_DENIED");
});

test("Employee can access and comment on department work but is denied outside the department", async () => {
  const alphaItem = await createItem(state.teams.alpha.id, state.users.alphaManager.id);
  const betaItem = await createItem(state.teams.beta.id, state.users.betaManager.id);

  const visible = await as(state.users.alphaEmployee).get(`/api/work-items/${alphaItem.id}`);
  assert.equal(visible.status, 200);
  const list = await as(state.users.alphaEmployee)
    .get("/api/work-items")
    .query({ teamId: state.teams.alpha.id, page: 1, pageSize: 100 });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((item) => item.id === alphaItem.id));

  const comment = await as(state.users.alphaEmployee)
    .post(`/api/work-items/${alphaItem.id}/comments`)
    .send({ body: "Employee department comment" });
  assert.equal(comment.status, 201);

  const outside = await as(state.users.alphaEmployee).get(`/api/work-items/${betaItem.id}`);
  const outsideComment = await as(state.users.alphaEmployee)
    .post(`/api/work-items/${betaItem.id}/comments`)
    .send({ body: "Must not be saved" });
  assert.equal(outside.status, 403);
  assert.equal(outsideComment.status, 403);
  assert.equal(await prisma.comment.count({ where: { workItemId: betaItem.id } }), 0);
});

test("Manager can assign any open department item but Employee and outside Manager cannot", async () => {
  const item = await createItem(state.teams.alpha.id, state.users.alphaEmployee2.id);
  const employeeDenied = await as(state.users.alphaEmployee)
    .post(`/api/work-items/${item.id}/assign`)
    .send({ expectedVersion: item.version, assigneeId: state.users.alphaEmployee.id });
  const outsideDenied = await as(state.users.betaManager)
    .post(`/api/work-items/${item.id}/assign`)
    .send({ expectedVersion: item.version, assigneeId: state.users.alphaEmployee.id });
  assert.equal(employeeDenied.status, 403);
  assert.equal(outsideDenied.status, 403);

  const assigned = await as(state.users.alphaManager)
    .post(`/api/work-items/${item.id}/assign`)
    .send({ expectedVersion: item.version, assigneeId: state.users.alphaEmployee.id });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.item.assignee_id, state.users.alphaEmployee.id);
  assert.equal(await prisma.auditLog.count({ where: { workItemId: item.id, action: "ASSIGNED" } }), 1);
});

test("inactive users are rejected even when their token and membership are otherwise valid", async () => {
  const response = await as(state.users.inactiveEmployee)
    .get("/api/work-items")
    .query({ teamId: state.teams.alpha.id });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHENTICATED");
});

test("claim is Employee-only, department-bound, open-only, unassigned, and atomic", async () => {
  const open = await createItem(state.teams.alpha.id, state.users.alphaManager.id);
  const [first, second] = await Promise.all([
    as(state.users.alphaEmployee).post(`/api/work-items/${open.id}/claim`),
    as(state.users.alphaEmployee2).post(`/api/work-items/${open.id}/claim`),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal(await prisma.auditLog.count({ where: { workItemId: open.id, action: "CLAIMED" } }), 1);

  const assigned = await createItem(state.teams.alpha.id, state.users.alphaManager.id, {
    assigneeId: state.users.alphaEmployee.id,
    status: "In Progress",
  });
  assert.equal((await as(state.users.alphaEmployee2).post(`/api/work-items/${assigned.id}/claim`)).status, 409);
  assert.equal((await as(state.users.alphaManager).post(`/api/work-items/${assigned.id}/claim`)).status, 403);
  assert.equal((await as(state.users.betaEmployee).post(`/api/work-items/${assigned.id}/claim`)).status, 403);
});

test("only the assignee may make Employee status changes and rejected changes create no audit", async () => {
  const item = await createItem(state.teams.alpha.id, state.users.alphaManager.id, {
    assigneeId: state.users.alphaEmployee.id,
    status: "Changes Requested",
  });
  const denied = await as(state.users.alphaEmployee2)
    .patch(`/api/work-items/${item.id}`)
    .send({ expectedVersion: item.version, status: "In Progress" });
  assert.equal(denied.status, 403);
  assert.equal(await prisma.auditLog.count({ where: { workItemId: item.id } }), 0);

  const allowed = await as(state.users.alphaEmployee)
    .patch(`/api/work-items/${item.id}`)
    .send({ expectedVersion: item.version, status: "In Progress" });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.item.status, "In Progress");
  assert.equal(await prisma.auditLog.count({ where: { workItemId: item.id, action: "STATUS_CHANGED" } }), 1);
});

test("approval workflow requires the assignee submission and a different department Manager", async () => {
  const item = await createItem(state.teams.alpha.id, state.users.alphaManager.id, {
    assigneeId: state.users.alphaEmployee.id,
    status: "In Progress",
    approvalRequired: true,
  });
  const nonOwner = await as(state.users.alphaEmployee2)
    .post(`/api/work-items/${item.id}/request-approval`)
    .send({ expectedVersion: item.version, resolutionProposal: "Completed by another employee." });
  assert.equal(nonOwner.status, 403);

  const submitted = await as(state.users.alphaEmployee)
    .post(`/api/work-items/${item.id}/request-approval`)
    .send({ expectedVersion: item.version, resolutionProposal: "Completed with supporting evidence." });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.item.status, "Awaiting Approval");

  const outsideManager = await as(state.users.betaManager)
    .post(`/api/work-items/${item.id}/approve`)
    .send({ expectedVersion: submitted.body.item.version });
  assert.equal(outsideManager.status, 403);

  const approved = await as(state.users.alphaManager2)
    .post(`/api/work-items/${item.id}/approve`)
    .send({ expectedVersion: submitted.body.item.version });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.item.status, "Approved");
});

test("approval-required, invalid, stale, and terminal transitions are rejected without extra audits", async () => {
  const item = await createItem(state.teams.alpha.id, state.users.alphaManager.id, {
    assigneeId: state.users.alphaEmployee.id,
    status: "In Progress",
    approvalRequired: true,
  });
  const resolveDenied = await as(state.users.alphaEmployee)
    .post(`/api/work-items/${item.id}/resolve`)
    .send({ expectedVersion: item.version, resolutionProposal: "Trying to bypass approval." });
  assert.equal(resolveDenied.status, 409);
  assert.equal(await prisma.auditLog.count({ where: { workItemId: item.id } }), 0);

  const first = await as(state.users.alphaManager)
    .patch(`/api/work-items/${item.id}`)
    .send({ expectedVersion: item.version, priority: "High" });
  assert.equal(first.status, 200);
  const stale = await as(state.users.alphaManager)
    .patch(`/api/work-items/${item.id}`)
    .send({ expectedVersion: item.version, priority: "Critical" });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, "STALE_DATA");
  assert.equal(await prisma.auditLog.count({ where: { workItemId: item.id, action: "UPDATED" } }), 1);

  const terminal = await createItem(state.teams.alpha.id, state.users.alphaManager.id, {
    assigneeId: state.users.alphaEmployee.id,
    status: "Resolved",
  });
  const terminalEdit = await as(state.users.alphaManager)
    .patch(`/api/work-items/${terminal.id}`)
    .send({ expectedVersion: terminal.version, priority: "High" });
  assert.equal(terminalEdit.status, 409);
  assert.equal(terminalEdit.body.error, "TERMINAL_ITEM");
  assert.equal(await prisma.auditLog.count({ where: { workItemId: terminal.id } }), 0);
});

test("request-changes, resubmission, approved close, and direct resolution follow the declared workflow", async () => {
  const approvalItem = await createItem(state.teams.alpha.id, state.users.alphaManager.id, {
    assigneeId: state.users.alphaEmployee.id,
    status: "Awaiting Approval",
    approvalRequired: true,
    resolutionProposal: "Initial completion evidence.",
  });
  const changes = await as(state.users.alphaManager2)
    .post(`/api/work-items/${approvalItem.id}/request-changes`)
    .send({ expectedVersion: approvalItem.version, reason: "Attach the final control evidence." });
  assert.equal(changes.status, 200);
  assert.equal(changes.body.item.status, "Changes Requested");

  const resumed = await as(state.users.alphaEmployee)
    .patch(`/api/work-items/${approvalItem.id}`)
    .send({ expectedVersion: changes.body.item.version, status: "In Progress" });
  assert.equal(resumed.status, 200);
  const resubmitted = await as(state.users.alphaEmployee)
    .post(`/api/work-items/${approvalItem.id}/request-approval`)
    .send({ expectedVersion: resumed.body.item.version, resolutionProposal: "Final evidence is now attached." });
  assert.equal(resubmitted.status, 200);
  const approved = await as(state.users.alphaManager2)
    .post(`/api/work-items/${approvalItem.id}/approve`)
    .send({ expectedVersion: resubmitted.body.item.version });
  assert.equal(approved.status, 200);
  const closed = await as(state.users.alphaEmployee)
    .patch(`/api/work-items/${approvalItem.id}`)
    .send({ expectedVersion: approved.body.item.version, status: "Closed" });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.item.status, "Closed");

  const directItem = await createItem(state.teams.alpha.id, state.users.alphaManager.id, {
    assigneeId: state.users.alphaEmployee.id,
    status: "In Progress",
    approvalRequired: false,
  });
  const resolved = await as(state.users.alphaEmployee)
    .post(`/api/work-items/${directItem.id}/resolve`)
    .send({ expectedVersion: directItem.version, resolutionProposal: "Resolved without approval as configured." });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.item.status, "Resolved");

  const terminalRetry = await as(state.users.alphaManager)
    .patch(`/api/work-items/${directItem.id}`)
    .send({ expectedVersion: resolved.body.item.version, priority: "Critical" });
  assert.equal(terminalRetry.status, 409);
});

test("create replay and concurrent duplicate requests return one created item", async () => {
  const idempotencyKey = crypto.randomUUID();
  const payload = {
    teamId: state.teams.alpha.id,
    title: "Idempotent API creation",
    description: "The same logical create request must produce one item.",
    priority: "Medium",
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    approvalRequired: false,
  };
  const first = await as(state.users.alphaManager)
    .post("/api/work-items")
    .set("Idempotency-Key", idempotencyKey)
    .send(payload);
  const replay = await as(state.users.alphaManager)
    .post("/api/work-items")
    .set("Idempotency-Key", idempotencyKey)
    .send(payload);
  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.item.id, first.body.item.id);
  assert.equal(replay.body.replayed, true);

  const concurrentKey = crypto.randomUUID();
  const [concurrentA, concurrentB] = await Promise.all([
    as(state.users.alphaManager).post("/api/work-items").set("Idempotency-Key", concurrentKey).send(payload),
    as(state.users.alphaManager).post("/api/work-items").set("Idempotency-Key", concurrentKey).send(payload),
  ]);
  assert.deepEqual([concurrentA.status, concurrentB.status].sort(), [200, 201]);
  assert.equal(concurrentA.body.item.id, concurrentB.body.item.id);
  assert.equal(await prisma.workItem.count({
    where: { creatorId: state.users.alphaManager.id, teamId: state.teams.alpha.id, idempotencyKey: concurrentKey },
  }), 1);
});
