import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Database clean kar rahe hain...");
  await prisma.auditLog.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.user.deleteMany();

  console.log("Passwords hash ho rahe hain...");
  const passwordHash = await bcrypt.hash("password123", 12);

  console.log("Users create kar rahe hain...");
  const admin = await prisma.user.create({
    data: {
      fullName: "Priya Sharma (Admin)",
      email: "admin@company.com",
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const employee = await prisma.user.create({
    data: {
      fullName: "Aarav Patel (Employee)",
      email: "employee@company.com",
      passwordHash,
      role: UserRole.EMPLOYEE,
      isActive: true,
    },
  });

  console.log("Sample Work Items create kar rahe hain...");
  const items = await prisma.workItem.createMany({
    data: [
      {
        title: "Double charge detected on Stripe for Order #84920",
        description: "Customer reports two identical $149 transactions. Needs immediate investigation and refund review.",
        status: "In Review",
        priority: "Critical",
        team: "Payments",
        creatorId: admin.id,
        assigneeId: employee.id,
        approvalRequired: true,
        version: 1,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      },
      {
        title: "Compliance KYC check missing for Merchant #1902",
        description: "Merchant processing volume exceeded $50,000 threshold without Tier-2 document verification.",
        status: "In Progress",
        priority: "High",
        team: "Compliance",
        creatorId: admin.id,
        assigneeId: employee.id,
        approvalRequired: false,
        version: 1,
        dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
      {
        title: "Manual chargeback dispute for Account #7712",
        description: "Cardholder dispute resolved out of band with issuer. $420 balance adjustment required.",
        status: "Blocked",
        priority: "High",
        team: "Finance Ops",
        creatorId: employee.id,
        assigneeId: employee.id,
        approvalRequired: true,
        version: 1,
        dueAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // Overdue!
      },
      {
        title: "Quarterly audit log checklist review",
        description: "Perform scheduled quarterly compliance verification on all export requests.",
        status: "Open",
        priority: "Medium",
        team: "Operations",
        creatorId: admin.id,
        version: 1,
        dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      {
        title: "Core API latency spike investigation",
        description: "Database connection pool utilization reached 92% during peak payment processing window.",
        status: "Open",
        priority: "Critical",
        team: "Engineering",
        creatorId: admin.id,
        version: 1,
        dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    ],
  });

  console.log("Database seed complete! Test credentials ready:");
  console.log("1. Admin: admin@company.com / password123");
  console.log("2. Employee: employee@company.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });