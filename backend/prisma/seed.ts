import bcrypt from "bcrypt";
import { TeamRole, UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const departments = [
  { name: "Operations", slug: "operations" },
  { name: "Finance", slug: "finance" },
  { name: "Engineers", slug: "engineers" },
] as const;

type SeededUser = {
  id: string;
  fullName: string;
  email: string;
};

async function upsertUser(
  fullName: string,
  email: string,
  passwordHash: string,
  role: UserRole = UserRole.EMPLOYEE
) {
  return prisma.user.upsert({
    where: { email },
    update: { fullName, passwordHash, role, isActive: true },
    create: { fullName, email, passwordHash, role, isActive: true },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);
  const departmentUserIds: string[] = [];

  await prisma.user.updateMany({
    where: { role: UserRole.ADMIN, email: { not: "admin@company.com" } },
    data: { role: UserRole.EMPLOYEE },
  });

  const admin = await upsertUser(
    "Global Administrator",
    "admin@company.com",
    passwordHash,
    UserRole.ADMIN
  );

  for (const department of departments) {
    const team = await prisma.team.upsert({
      where: { slug: department.slug },
      update: { name: department.name },
      create: department,
    });

    const seededUsers: Array<{ user: SeededUser; role: TeamRole }> = [];

    for (let index = 1; index <= 2; index += 1) {
      const user = await upsertUser(
        `${department.name} Manager ${index}`,
        `${department.slug}.manager${index}@company.com`,
        passwordHash
      );
      seededUsers.push({ user, role: TeamRole.MANAGER });
    }

    for (let index = 1; index <= 4; index += 1) {
      const user = await upsertUser(
        `${department.name} Employee ${index}`,
        `${department.slug}.employee${index}@company.com`,
        passwordHash
      );
      seededUsers.push({ user, role: TeamRole.MEMBER });
    }

    const viewer = await upsertUser(
      `${department.name} Viewer`,
      `${department.slug}.viewer@company.com`,
      passwordHash
    );
    seededUsers.push({ user: viewer, role: TeamRole.VIEWER });

    for (const { user, role } of seededUsers) {
      departmentUserIds.push(user.id);
      await prisma.teamMembership.upsert({
        where: { userId_teamId: { userId: user.id, teamId: team.id } },
        update: { role },
        create: { userId: user.id, teamId: team.id, role },
      });
    }

    const employees = seededUsers.filter(({ role }) => role === TeamRole.MEMBER);
    const examples: Array<{
      title: string;
      category: string;
      priority: string;
      status: string;
      assigneeId: string | null;
      approvalRequired?: boolean;
      resolutionProposal?: string;
    }> = [
      {
        title: `${department.name}: Review urgent customer escalation`,
        category: "Customer escalation",
        priority: "Critical",
        status: "Open",
        assigneeId: null,
      },
      {
        title: `${department.name}: Investigate daily reconciliation exception`,
        category: "Investigation",
        priority: "High",
        status: "Awaiting Approval",
        assigneeId: employees[0].user.id,
        approvalRequired: true,
        resolutionProposal: "Investigation completed and supporting evidence attached for manager review.",
      },
      {
        title: `${department.name}: Complete weekly control checklist`,
        category: "Control review",
        priority: "Medium",
        status: "Open",
        assigneeId: null,
      },
      {
        title: `${department.name}: Resolve service request`,
        category: "Service request",
        priority: "High",
        status: "In Progress",
        assigneeId: employees[1].user.id,
      },
      {
        title: `${department.name}: Validate month-end operational report`,
        category: "Reporting",
        priority: "Low",
        status: "In Progress",
        assigneeId: employees[2].user.id,
      },
    ];

    for (const [index, example] of examples.entries()) {
      const idempotencyKey = `seed-${department.slug}-${index + 1}`;
      const existing = await prisma.workItem.findFirst({
        where: { creatorId: admin.id, teamId: team.id, idempotencyKey },
      });
      const item = existing
        ? await prisma.workItem.update({
            where: { id: existing.id },
            data: {
              ...example,
              description: `Seeded ${department.name} work item for demonstrating role-based access and ownership.`,
            },
          })
        : await prisma.workItem.create({
            data: {
              ...example,
              description: `Seeded ${department.name} work item for demonstrating role-based access and ownership.`,
              teamId: team.id,
              creatorId: admin.id,
              idempotencyKey,
              dueAt: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000),
            },
          });
      if (!existing) {
        await prisma.auditLog.create({
          data: { workItemId: item.id, actorId: admin.id, action: "CREATED" },
        });
      }
      if (item.status === "Awaiting Approval" && item.assigneeId) {
        const requestAudit = await prisma.auditLog.findFirst({
          where: { workItemId: item.id, actorId: item.assigneeId, action: "APPROVAL_REQUESTED" },
        });
        if (!requestAudit) {
          await prisma.auditLog.create({
            data: { workItemId: item.id, actorId: item.assigneeId, action: "APPROVAL_REQUESTED" },
          });
        }
      }
    }

    const departmentManager = seededUsers.find(({ role }) => role === TeamRole.MANAGER)!.user;
    const approvalKey = `seed-manager-approval-${department.slug}`;
    const managerApproval = await prisma.workItem.upsert({
      where: {
        creatorId_teamId_idempotencyKey: {
          creatorId: departmentManager.id,
          teamId: team.id,
          idempotencyKey: approvalKey,
        },
      },
      update: {
        status: "Awaiting Approval",
        assigneeId: employees[0].user.id,
        approvalRequired: true,
        resolutionProposal: "Work completed and submitted for the department manager's approval.",
        resolution: null,
        approvedById: null,
        approvedAt: null,
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
      create: {
        title: `${department.name}: Approve completed department task`,
        description: "Manager-created ticket submitted by the assigned employee for approval.",
        category: "Approval",
        priority: "Medium",
        status: "Awaiting Approval",
        teamId: team.id,
        creatorId: departmentManager.id,
        assigneeId: employees[0].user.id,
        approvalRequired: true,
        resolutionProposal: "Work completed and submitted for the department manager's approval.",
        idempotencyKey: approvalKey,
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });
    const managerApprovalAudit = await prisma.auditLog.findFirst({
      where: {
        workItemId: managerApproval.id,
        actorId: employees[0].user.id,
        action: "APPROVAL_REQUESTED",
      },
    });
    if (!managerApprovalAudit) {
      await prisma.auditLog.create({
        data: {
          workItemId: managerApproval.id,
          actorId: employees[0].user.id,
          action: "APPROVAL_REQUESTED",
        },
      });
    }
  }

  await prisma.teamMembership.deleteMany({
    where: { userId: { notIn: departmentUserIds } },
  });

  console.log("Seed complete: 1 global admin and 7 users in each of 3 departments.");
  console.log("All seeded accounts use password: password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
