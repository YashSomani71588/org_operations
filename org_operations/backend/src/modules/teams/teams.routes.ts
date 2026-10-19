import { TeamRole } from "@prisma/client";
import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { apiError, validationError } from "../../lib/api-error";
import { requireAuthentication } from "../../middleware/require-authentication";
import { organizationEmailSchema } from "../auth/auth.schemas";
import { requireTeamRole } from "./team-access";

export const teamsRouter = Router();

const managedUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: organizationEmailSchema,
  password: z.string().min(8).max(72),
  role: z.enum(["EMPLOYEE", "MANAGER"]).default("EMPLOYEE"),
});

function apiDepartmentRole(role: TeamRole) {
  return role === TeamRole.MANAGER ? "MANAGER" as const : "EMPLOYEE" as const;
}

teamsRouter.use(requireAuthentication);

teamsRouter.get("/", async (request, response, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.auth!.userId },
      select: { role: true },
    });

    if (user.role === "ADMIN") {
      const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
      return response.json({
        teams: teams.map((team) => ({ ...team, role: "MANAGER" as const, isGlobalAdmin: true })),
      });
    }

    const memberships = await prisma.teamMembership.findMany({
      where: { userId: request.auth!.userId },
      include: { team: true },
      orderBy: { team: { name: "asc" } },
    });

    return response.json({
      teams: memberships.map(({ team, role }) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        role: apiDepartmentRole(role),
        isGlobalAdmin: false,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

teamsRouter.get("/:teamId/overview", async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: { role: true, isActive: true },
    });
    if (!user?.isActive || user.role !== "ADMIN") {
      return apiError(response, 403, "ADMIN_REQUIRED", "Admin access is required.");
    }

    const team = await prisma.team.findUnique({
      where: { id: request.params.teamId },
      select: { id: true, name: true, slug: true },
    });
    if (!team) return apiError(response, 404, "TEAM_NOT_FOUND", "Department not found.");

    const [managerMemberships, totalTickets, pendingApprovals] = await prisma.$transaction([
      prisma.teamMembership.findMany({
        where: { teamId: team.id, role: TeamRole.MANAGER, user: { isActive: true } },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { user: { fullName: "asc" } },
      }),
      prisma.workItem.count({ where: { teamId: team.id } }),
      prisma.workItem.count({ where: { teamId: team.id, status: "Awaiting Approval" } }),
    ]);

    return response.json({
      department: team,
      managers: managerMemberships.map(({ user }) => user),
      ticketSummary: { total: totalTickets, pendingApprovals },
    });
  } catch (error) {
    return next(error);
  }
});

teamsRouter.get("/:teamId/employees", async (request, response, next) => {
  try {
    const teamId = request.params.teamId;
    const access = await requireTeamRole(request.auth!.userId, teamId, TeamRole.MANAGER);
    if (!access) return apiError(response, 403, "MANAGER_REQUIRED");

    const memberships = await prisma.teamMembership.findMany({
      where: { teamId, role: TeamRole.MEMBER, user: { isActive: true } },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { user: { fullName: "asc" } },
    });

    return response.json({
      employees: memberships.map(({ user }) => ({ ...user, role: "EMPLOYEE" as const })),
    });
  } catch (error) {
    return next(error);
  }
});

teamsRouter.get("/:teamId/users", async (request, response, next) => {
  try {
    const teamId = request.params.teamId;
    const access = await requireTeamRole(request.auth!.userId, teamId, TeamRole.MANAGER);
    if (!access) return apiError(response, 403, "MANAGER_REQUIRED");

    const memberships = await prisma.teamMembership.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, fullName: true, email: true, isActive: true, lastSeenAt: true } },
      },
      orderBy: [{ role: "asc" }, { user: { fullName: "asc" } }],
    });

    return response.json({
      department: { id: access.team.id, name: access.team.name },
      users: memberships.map((membership) => ({
        membershipId: membership.id,
        userId: membership.user.id,
        fullName: membership.user.fullName,
        email: membership.user.email,
        role: apiDepartmentRole(membership.role),
        isActive: membership.user.isActive,
        lastSeenAt: membership.user.lastSeenAt?.toISOString() ?? null,
        presence: membership.user.lastSeenAt && membership.user.lastSeenAt > new Date(Date.now() - 2 * 60 * 1000) ? "ONLINE" : "OFFLINE",
      })),
    });
  } catch (error) {
    return next(error);
  }
});

teamsRouter.post("/:teamId/users", async (request, response, next) => {
  try {
    const teamId = request.params.teamId;
    const access = await requireTeamRole(request.auth!.userId, teamId, TeamRole.MANAGER);
    if (!access) return apiError(response, 403, "MANAGER_REQUIRED");

    const parsed = managedUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return validationError(response, parsed.error);
    }
    if (!access.isGlobalAdmin && parsed.data.role === "MANAGER") {
      return apiError(response, 403, "ADMIN_REQUIRED_FOR_MANAGER_ROLE", "Only an Admin can grant Manager access.");
    }

    const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existingUser?.role === "ADMIN") {
      return apiError(response, 409, "ADMIN_ACCOUNT_ALREADY_HAS_GLOBAL_ACCESS", "This Admin already has global access.");
    }
    if (existingUser) {
      const existingMembership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId: existingUser.id, teamId } },
      });
      if (existingMembership) {
        return apiError(response, 409, "USER_ALREADY_IN_DEPARTMENT", "This user already belongs to the department.");
      }
    }

    const passwordHash = existingUser ? null : await bcrypt.hash(parsed.data.password, 12);
    const membership = await prisma.$transaction(async (tx) => {
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { isActive: true },
          })
        : await tx.user.create({
            data: {
              fullName: parsed.data.fullName,
              email: parsed.data.email,
              passwordHash: passwordHash!,
            },
          });

      return tx.teamMembership.create({
        data: { userId: user.id, teamId, role: parsed.data.role === "MANAGER" ? TeamRole.MANAGER : TeamRole.MEMBER },
        include: { user: { select: { id: true, fullName: true, email: true, isActive: true, lastSeenAt: true } } },
      });
    });

    return response.status(201).json({
      user: {
        membershipId: membership.id,
        userId: membership.user.id,
        fullName: membership.user.fullName,
        email: membership.user.email,
        role: apiDepartmentRole(membership.role),
        isActive: membership.user.isActive,
        lastSeenAt: membership.user.lastSeenAt?.toISOString() ?? null,
        presence: membership.user.lastSeenAt && membership.user.lastSeenAt > new Date(Date.now() - 2 * 60 * 1000) ? "ONLINE" : "OFFLINE",
      },
    });
  } catch (error) {
    return next(error);
  }
});

teamsRouter.delete("/:teamId/users/:userId", async (request, response, next) => {
  try {
    const teamId = request.params.teamId;
    const userId = request.params.userId;
    const access = await requireTeamRole(request.auth!.userId, teamId, TeamRole.MANAGER);
    if (!access) return apiError(response, 403, "MANAGER_REQUIRED");
    if (userId === request.auth!.userId) {
      return apiError(response, 409, "CANNOT_REVOKE_OWN_ACCESS", "You cannot revoke your own department access.");
    }

    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      include: { user: { select: { role: true } } },
    });
    if (!membership) return apiError(response, 404, "DEPARTMENT_ACCESS_NOT_FOUND", "Department access was not found.");
    if (membership.user.role === "ADMIN") {
      return apiError(response, 409, "GLOBAL_ADMIN_ACCESS_CANNOT_BE_REVOKED_HERE", "Global Admin access cannot be revoked from a department.");
    }
    if (!access.isGlobalAdmin && membership.role === TeamRole.MANAGER) {
      return apiError(response, 403, "ADMIN_REQUIRED_TO_REVOKE_MANAGER", "Only an Admin can revoke Manager access.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamMembership.delete({ where: { id: membership.id } });
      const remainingMemberships = await tx.teamMembership.count({ where: { userId } });
      if (remainingMemberships === 0) {
        await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      }
    });

    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});
