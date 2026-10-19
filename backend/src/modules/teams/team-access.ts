import type { TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const roleRank: Record<TeamRole, number> = {
  MEMBER: 0,
  MANAGER: 2,
};

export type ProductRole = "Admin" | "Manager" | "Employee";

export function toProductRole(role: TeamRole, isGlobalAdmin = false): ProductRole {
  if (isGlobalAdmin) return "Admin";
  return role === "MANAGER" ? "Manager" : "Employee";
}

export function hasTeamRole(actual: TeamRole, required: TeamRole): boolean {
  return roleRank[actual] >= roleRank[required];
}

export async function getMembership(userId: string, teamId: string) {
  return prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    include: { team: true },
  });
}

export async function requireTeamRole(
  userId: string,
  teamId: string,
  required: TeamRole
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user?.isActive) return null;

  if (user.role === "ADMIN") {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return null;
    return { role: "MANAGER" as const, team, isGlobalAdmin: true };
  }

  const membership = await getMembership(userId, teamId);
  return membership && hasTeamRole(membership.role, required)
    ? { ...membership, isGlobalAdmin: false }
    : null;
}
