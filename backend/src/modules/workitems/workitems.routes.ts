import { Prisma, TeamRole } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuthentication } from "../../middleware/require-authentication";
import { requireTeamRole } from "../teams/team-access";
import {
  assignWorkItemSchema,
  commentSchema,
  createWorkItemSchema,
  decisionSchema,
  listWorkItemsSchema,
  resolutionSchema,
  updateWorkItemSchema,
} from "./workitems.schemas";

export const workItemsRouter = Router();
workItemsRouter.use(requireAuthentication);

const itemInclude = Prisma.validator<Prisma.WorkItemInclude>()({
  team: true,
  creator: { select: { id: true, fullName: true, email: true } },
  assignee: { select: { id: true, fullName: true, email: true } },
  approvedBy: { select: { id: true, fullName: true, email: true } },
  _count: { select: { comments: true } },
  auditLogs: {
    where: { action: "APPROVAL_REQUESTED" },
    include: { actor: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  },
});

type ItemWithRelations = Prisma.WorkItemGetPayload<{ include: typeof itemInclude }>;

function formatItem(item: ItemWithRelations) {
  const approvalRequest = item.auditLogs.find((event) => event.action === "APPROVAL_REQUESTED");
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    status: item.status,
    priority: item.priority,
    team_id: item.teamId,
    team: item.team.name,
    creator: item.creator,
    assignee_id: item.assigneeId,
    assignee_name: item.assignee?.fullName ?? "Unassigned",
    approval_requested_by: approvalRequest?.actor ?? null,
    approval_requested_at: approvalRequest?.createdAt.toISOString() ?? null,
    approval_required: item.approvalRequired,
    resolution_proposal: item.resolutionProposal,
    resolution: item.resolution,
    approved_by: item.approvedBy,
    approved_at: item.approvedAt?.toISOString() ?? null,
    version: item.version,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
    due_at: item.dueAt?.toISOString() ?? null,
    comment_count: item._count.comments,
  };
}

function parseItemId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validationError(response: Response, error: z.ZodError) {
  return response.status(400).json({
    error: "VALIDATION_ERROR",
    details: error.flatten().fieldErrors,
  });
}

async function visibleItem(itemId: number, userId: string) {
  const item = await prisma.workItem.findUnique({
    where: { id: itemId },
    include: itemInclude,
  });
  if (!item) return { item: null, membership: null };
  const membership = await requireTeamRole(userId, item.teamId, TeamRole.VIEWER);
  if (!membership || membership.isGlobalAdmin || membership.role === TeamRole.VIEWER) {
    return { item, membership };
  }
  if (
    membership.role === TeamRole.MANAGER &&
    item.creatorId !== userId &&
    !item.auditLogs.some((event) => event.action === "APPROVAL_REQUESTED" && event.actorId === userId)
  ) {
    return { item, membership: null };
  }
  if (
    membership.role === TeamRole.MEMBER &&
    item.assigneeId !== userId &&
    item.creatorId !== userId &&
    !(item.assigneeId === null && item.status === "Open") &&
    !item.auditLogs.some((event) => event.action === "APPROVAL_REQUESTED" && event.actorId === userId)
  ) {
    return { item, membership: null };
  }
  return { item, membership };
}

workItemsRouter.get("/", async (request, response, next) => {
  try {
    const parsed = listWorkItemsSchema.safeParse(request.query);
    if (!parsed.success) return validationError(response, parsed.error);

    const { teamId, page, pageSize, search, status, priority, view } = parsed.data;
    const membership = await requireTeamRole(request.auth!.userId, teamId, TeamRole.VIEWER);
    if (!membership) return response.status(403).json({ error: "TEAM_ACCESS_DENIED" });

    const accessConditions: Prisma.WorkItemWhereInput[] = [];
    const managerPersonalAccess: Prisma.WorkItemWhereInput = {
      OR: [
        { creatorId: request.auth!.userId },
        { auditLogs: { some: { actorId: request.auth!.userId, action: "APPROVAL_REQUESTED" } } },
      ],
    };
    if (membership.role === TeamRole.MANAGER && (!membership.isGlobalAdmin || view === "my-work")) {
      accessConditions.push(managerPersonalAccess);
    } else if (!membership.isGlobalAdmin && membership.role === TeamRole.MEMBER) {
      accessConditions.push({
        OR: [
          { assigneeId: request.auth!.userId },
          { assigneeId: null, status: "Open" },
          { auditLogs: { some: { actorId: request.auth!.userId, action: "APPROVAL_REQUESTED" } } },
        ],
      });
    }

    const where: Prisma.WorkItemWhereInput = { teamId, AND: accessConditions };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (search) {
      accessConditions.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { category: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (view === "mine") {
      where.assigneeId = request.auth!.userId;
      where.status = { not: "Resolved" };
    } else if (view === "unassigned") {
      where.assigneeId = null;
      where.status = { not: "Resolved" };
    } else if (view === "awaiting-approval") {
      where.status = "Awaiting Approval";
    } else if (view === "overdue") {
      where.dueAt = { lt: new Date() };
      where.status = { not: "Resolved" };
    }

    const [items, total] = await prisma.$transaction([
      prisma.workItem.findMany({
        where,
        include: itemInclude,
        orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.workItem.count({ where }),
    ]);

    return response.json({
      items: items.map(formatItem),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.post("/", async (request, response, next) => {
  try {
    const parsed = createWorkItemSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);

    const userId = request.auth!.userId;
    const membership = await requireTeamRole(userId, parsed.data.teamId, TeamRole.MANAGER);
    if (!membership) return response.status(403).json({ error: "MANAGER_REQUIRED" });

    const idempotencyKey = request.header("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 100) {
      return response.status(400).json({ error: "VALID_IDEMPOTENCY_KEY_REQUIRED" });
    }

    const existing = await prisma.workItem.findFirst({
      where: { creatorId: userId, teamId: parsed.data.teamId, idempotencyKey },
      include: itemInclude,
    });
    if (existing) return response.status(200).json({ item: formatItem(existing), replayed: true });

    try {
      const item = await prisma.$transaction(async (tx) => {
        const created = await tx.workItem.create({
          data: {
            teamId: parsed.data.teamId,
            creatorId: userId,
            idempotencyKey,
            title: parsed.data.title,
            description: parsed.data.description,
            category: membership.team.name,
            priority: parsed.data.priority,
            dueAt: new Date(parsed.data.dueAt),
            approvalRequired: parsed.data.approvalRequired,
          },
          include: itemInclude,
        });
        await tx.auditLog.create({
          data: { workItemId: created.id, actorId: userId, action: "CREATED" },
        });
        return created;
      });
      return response.status(201).json({ item: formatItem(item), replayed: false });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await prisma.workItem.findFirstOrThrow({
          where: { creatorId: userId, teamId: parsed.data.teamId, idempotencyKey },
          include: itemInclude,
        });
        return response.status(200).json({ item: formatItem(replay), replayed: true });
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.get("/:id", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership) return response.status(403).json({ error: "TEAM_ACCESS_DENIED" });

    const [comments, activity] = await prisma.$transaction([
      prisma.comment.findMany({
        where: { workItemId: itemId },
        include: { author: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { workItemId: itemId },
        include: { actor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return response.json({ item: formatItem(item), comments, activity, viewerRole: membership.role });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.patch("/:id", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const parsed = updateWorkItemSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);

    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership) return response.status(403).json({ error: "TEAM_ACCESS_DENIED" });
    const isManager = membership.role === TeamRole.MANAGER;
    if (item.assigneeId !== request.auth!.userId && !isManager) {
      return response.status(403).json({ error: "OWNER_OR_MANAGER_REQUIRED" });
    }
    if (item.status === "Awaiting Approval") {
      return response.status(409).json({ error: "ITEM_FROZEN_PENDING_APPROVAL" });
    }
    if (item.approvalRequired && parsed.data.approvalRequired === false) {
      return response.status(409).json({ error: "APPROVAL_REQUIREMENT_CANNOT_BE_REMOVED" });
    }
    if (parsed.data.status === "Closed" && item.approvalRequired && item.status !== "Approved") {
      return response.status(409).json({ error: "APPROVAL_REQUIRED_BEFORE_CLOSE" });
    }
    if (
      !isManager &&
      ["title", "description", "category", "priority", "dueAt", "approvalRequired"].some(
        (field) => parsed.data[field as keyof typeof parsed.data] !== undefined
      )
    ) {
      return response.status(403).json({ error: "MANAGER_REQUIRED_TO_EDIT_TASK_DETAILS" });
    }

    const { expectedVersion, dueAt, ...changes } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.workItem.updateMany({
        where: { id: itemId, version: expectedVersion },
        data: {
          ...changes,
          dueAt: dueAt === undefined ? undefined : dueAt === null ? null : new Date(dueAt),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) return null;
      await tx.auditLog.create({
        data: { workItemId: itemId, actorId: request.auth!.userId, action: "UPDATED", details: changes },
      });
      return tx.workItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
    });
    if (!result) {
      const latest = await prisma.workItem.findUnique({ where: { id: itemId }, select: { version: true } });
      return response.status(409).json({ error: "STALE_DATA", serverVersion: latest?.version });
    }
    return response.json({ item: formatItem(result) });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.post("/:id/claim", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const item = await prisma.workItem.findUnique({ where: { id: itemId } });
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    const membership = await requireTeamRole(request.auth!.userId, item.teamId, TeamRole.MEMBER);
    if (!membership) return response.status(403).json({ error: "TEAM_WRITE_DENIED" });

    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.workItem.updateMany({
        where: { id: itemId, assigneeId: null, status: "Open" },
        data: { assigneeId: request.auth!.userId, status: "In Progress", version: { increment: 1 } },
      });
      if (result.count === 0) return null;
      await tx.auditLog.create({
        data: { workItemId: itemId, actorId: request.auth!.userId, action: "CLAIMED" },
      });
      return tx.workItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
    });

    if (!claimed) {
      const current = await prisma.workItem.findUnique({ where: { id: itemId }, include: { assignee: true } });
      return response.status(409).json({
        error: "ALREADY_CLAIMED",
        message: current?.assignee ? `This item is already assigned to ${current.assignee.fullName}.` : "This item can no longer be claimed.",
      });
    }
    return response.json({ item: formatItem(claimed) });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.post("/:id/assign", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const parsed = assignWorkItemSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);

    const item = await prisma.workItem.findUnique({ where: { id: itemId } });
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    const managerAccess = await requireTeamRole(request.auth!.userId, item.teamId, TeamRole.MANAGER);
    if (!managerAccess) return response.status(403).json({ error: "MANAGER_REQUIRED" });
    if (!managerAccess.isGlobalAdmin && item.creatorId !== request.auth!.userId) {
      return response.status(403).json({ error: "MANAGER_CAN_ONLY_ASSIGN_OWN_WORK" });
    }

    const assigneeMembership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: parsed.data.assigneeId, teamId: item.teamId } },
      include: { user: { select: { isActive: true } } },
    });
    if (!assigneeMembership || assigneeMembership.role !== TeamRole.MEMBER || !assigneeMembership.user.isActive) {
      return response.status(400).json({ error: "ASSIGNEE_MUST_BE_ACTIVE_TEAM_EMPLOYEE" });
    }

    const assigned = await prisma.$transaction(async (tx) => {
      const result = await tx.workItem.updateMany({
        where: {
          id: itemId,
          version: parsed.data.expectedVersion,
          assigneeId: null,
          status: "Open",
        },
        data: {
          assigneeId: parsed.data.assigneeId,
          status: "In Progress",
          version: { increment: 1 },
        },
      });
      if (result.count === 0) return null;
      await tx.auditLog.create({
        data: {
          workItemId: itemId,
          actorId: request.auth!.userId,
          action: "ASSIGNED",
          details: { assigneeId: parsed.data.assigneeId },
        },
      });
      return tx.workItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
    });

    if (!assigned) {
      const current = await prisma.workItem.findUnique({
        where: { id: itemId },
        include: { assignee: { select: { fullName: true } } },
      });
      return response.status(409).json({
        error: "ITEM_ALREADY_ASSIGNED_OR_CHANGED",
        message: current?.assignee
          ? `This item is already assigned to ${current.assignee.fullName}.`
          : "This item changed before it could be assigned.",
        serverVersion: current?.version,
      });
    }

    return response.json({ item: formatItem(assigned) });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.post("/:id/comments", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership || membership.role === TeamRole.VIEWER) {
      return response.status(403).json({ error: "TEAM_WRITE_DENIED" });
    }

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { workItemId: itemId, authorId: request.auth!.userId, body: parsed.data.body },
        include: { author: { select: { id: true, fullName: true } } },
      });
      await tx.auditLog.create({
        data: { workItemId: itemId, actorId: request.auth!.userId, action: "COMMENTED" },
      });
      return created;
    });
    return response.status(201).json({ comment });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.delete("/:id/comments/:commentId", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    const commentId = Number(request.params.commentId);
    if (!itemId || !Number.isInteger(commentId) || commentId <= 0) {
      return response.status(400).json({ error: "INVALID_COMMENT_ID" });
    }

    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership || membership.role === TeamRole.VIEWER) {
      return response.status(403).json({ error: "TEAM_WRITE_DENIED" });
    }

    const comment = await prisma.comment.findFirst({ where: { id: commentId, workItemId: itemId } });
    if (!comment) return response.status(404).json({ error: "COMMENT_NOT_FOUND" });
    const canModerate = membership.isGlobalAdmin || membership.role === TeamRole.MANAGER;
    if (comment.authorId !== request.auth!.userId && !canModerate) {
      return response.status(403).json({ error: "COMMENT_DELETE_DENIED" });
    }

    await prisma.$transaction([
      prisma.comment.delete({ where: { id: comment.id } }),
      prisma.auditLog.create({
        data: {
          workItemId: itemId,
          actorId: request.auth!.userId,
          action: "COMMENT_DELETED",
          details: { commentId: comment.id },
        },
      }),
    ]);
    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.post("/:id/request-approval", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const parsed = resolutionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership || (item.assigneeId !== request.auth!.userId && membership.role !== TeamRole.MANAGER)) {
      return response.status(403).json({ error: "OWNER_OR_MANAGER_REQUIRED" });
    }
    if (!item.approvalRequired) return response.status(409).json({ error: "APPROVAL_NOT_REQUIRED" });
    if (!["In Progress", "Changes Requested"].includes(item.status)) {
      return response.status(409).json({ error: "INVALID_WORKFLOW_TRANSITION" });
    }

    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Awaiting Approval", resolutionProposal: parsed.data.resolutionProposal }, "APPROVAL_REQUESTED");
    if (!updated) return response.status(409).json({ error: "STALE_DATA" });
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

workItemsRouter.post("/:id/approve", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const parsed = decisionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership || membership.role !== TeamRole.MANAGER) return response.status(403).json({ error: "MANAGER_REQUIRED" });
    if (item.assigneeId === request.auth!.userId) return response.status(409).json({ error: "APPROVER_MUST_BE_DIFFERENT_USER" });
    if (item.status !== "Awaiting Approval" || !item.resolutionProposal) {
      return response.status(409).json({ error: "INVALID_WORKFLOW_TRANSITION" });
    }
    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Approved", resolution: item.resolutionProposal, approvedById: request.auth!.userId, approvedAt: new Date() },
      "APPROVED", parsed.data.reason ? { reason: parsed.data.reason } : undefined);
    if (!updated) return response.status(409).json({ error: "STALE_DATA" });
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

workItemsRouter.post("/:id/request-changes", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const parsed = decisionSchema.extend({ reason: z.string().trim().min(3).max(2_000) }).safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership || membership.role !== TeamRole.MANAGER) return response.status(403).json({ error: "MANAGER_REQUIRED" });
    if (item.status !== "Awaiting Approval") return response.status(409).json({ error: "INVALID_WORKFLOW_TRANSITION" });
    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Changes Requested" }, "CHANGES_REQUESTED", { reason: parsed.data.reason });
    if (!updated) return response.status(409).json({ error: "STALE_DATA" });
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

workItemsRouter.post("/:id/resolve", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return response.status(400).json({ error: "INVALID_WORK_ITEM_ID" });
    const parsed = resolutionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return response.status(404).json({ error: "WORK_ITEM_NOT_FOUND" });
    if (!membership || (item.assigneeId !== request.auth!.userId && membership.role !== TeamRole.MANAGER)) {
      return response.status(403).json({ error: "OWNER_OR_MANAGER_REQUIRED" });
    }
    if (item.approvalRequired) return response.status(409).json({ error: "APPROVAL_REQUIRED" });
    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Resolved", resolution: parsed.data.resolutionProposal }, "RESOLVED");
    if (!updated) return response.status(409).json({ error: "STALE_DATA" });
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

async function versionedWorkflowUpdate(
  itemId: number,
  expectedVersion: number,
  actorId: string,
  data: Prisma.WorkItemUncheckedUpdateManyInput,
  action: string,
  details?: Prisma.InputJsonValue
) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.workItem.updateMany({
      where: { id: itemId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    await tx.auditLog.create({ data: { workItemId: itemId, actorId, action, details } });
    return tx.workItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
  });
}
