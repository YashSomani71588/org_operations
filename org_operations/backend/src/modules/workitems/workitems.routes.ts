import { Prisma, TeamRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { apiError, validationError } from "../../lib/api-error";
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
import {
  canDecideApproval,
  canPatchStatus,
  canRequestApproval,
  canResolve,
  type WorkItemStatus,
} from "./workflow";

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

async function visibleItem(itemId: number, userId: string) {
  const item = await prisma.workItem.findUnique({
    where: { id: itemId },
    include: itemInclude,
  });
  if (!item) return { item: null, membership: null };
  const membership = await requireTeamRole(userId, item.teamId, TeamRole.MEMBER);
  return { item, membership };
}

workItemsRouter.get("/", async (request, response, next) => {
  try {
    const parsed = listWorkItemsSchema.safeParse(request.query);
    if (!parsed.success) return validationError(response, parsed.error);

    const { teamId, page, pageSize, search, status, priority, view } = parsed.data;
    const membership = await requireTeamRole(request.auth!.userId, teamId, TeamRole.MEMBER);
    if (!membership) return apiError(response, 403, "TEAM_ACCESS_DENIED");

    const accessConditions: Prisma.WorkItemWhereInput[] = [];
    if (view === "my-work") {
      accessConditions.push({
        OR: [
          { creatorId: request.auth!.userId },
          { assigneeId: request.auth!.userId },
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
    if (!membership) return apiError(response, 403, "MANAGER_REQUIRED");

    const idempotencyKey = request.header("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 100) {
      return apiError(response, 400, "VALID_IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.");
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
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership) return apiError(response, 403, "TEAM_ACCESS_DENIED");

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

    return response.json({
      item: formatItem(item),
      comments,
      activity,
      accessRole: membership.isGlobalAdmin ? "ADMIN" : membership.role === TeamRole.MANAGER ? "MANAGER" : "EMPLOYEE",
    });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.patch("/:id", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const parsed = updateWorkItemSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);

    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership) return apiError(response, 403, "TEAM_ACCESS_DENIED");
    const isManager = membership.role === TeamRole.MANAGER;
    if (item.assigneeId !== request.auth!.userId && !isManager) {
      return apiError(response, 403, "OWNER_REQUIRED");
    }
    if (["Closed", "Resolved"].includes(item.status)) {
      return apiError(response, 409, "TERMINAL_ITEM", "Closed and resolved work items cannot be changed.");
    }
    if (item.status === "Awaiting Approval") {
      return apiError(response, 409, "ITEM_FROZEN_PENDING_APPROVAL", "This item is frozen while approval is pending.");
    }
    if (item.approvalRequired && parsed.data.approvalRequired === false) {
      return apiError(response, 409, "APPROVAL_REQUIREMENT_CANNOT_BE_REMOVED", "The approval requirement cannot be removed after creation.");
    }
    if (
      !isManager &&
      ["title", "description", "category", "priority", "dueAt", "approvalRequired"].some(
        (field) => parsed.data[field as keyof typeof parsed.data] !== undefined
      )
    ) {
      return apiError(response, 403, "MANAGER_REQUIRED_TO_EDIT_TASK_DETAILS", "Only a Manager or Admin can edit task details.");
    }
    if (parsed.data.status && !canPatchStatus(item.status as WorkItemStatus, parsed.data.status, {
      approvalRequired: item.approvalRequired,
      hasAssignee: Boolean(item.assigneeId),
    })) {
      return apiError(response, 409, "INVALID_WORKFLOW_TRANSITION");
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
      const statusChanged = parsed.data.status !== undefined;
      await tx.auditLog.create({
        data: {
          workItemId: itemId,
          actorId: request.auth!.userId,
          action: statusChanged ? "STATUS_CHANGED" : "UPDATED",
          details: statusChanged ? { from: item.status, to: parsed.data.status } : changes,
        },
      });
      return tx.workItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
    });
    if (!result) {
      const latest = await prisma.workItem.findUnique({ where: { id: itemId }, select: { version: true } });
      return apiError(response, 409, "STALE_DATA", undefined, { serverVersion: latest?.version });
    }
    return response.json({ item: formatItem(result) });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.post("/:id/claim", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const item = await prisma.workItem.findUnique({ where: { id: itemId } });
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    const membership = await requireTeamRole(request.auth!.userId, item.teamId, TeamRole.MEMBER);
    if (!membership || membership.isGlobalAdmin || membership.role !== TeamRole.MEMBER) {
      return apiError(response, 403, "EMPLOYEE_REQUIRED", "Only an Employee in this department can claim work.");
    }

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
      return apiError(
        response,
        409,
        "ALREADY_CLAIMED",
        current?.assignee ? `This item is already assigned to ${current.assignee.fullName}.` : "This item is no longer open and unassigned."
      );
    }
    return response.json({ item: formatItem(claimed) });
  } catch (error) {
    return next(error);
  }
});

workItemsRouter.post("/:id/assign", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const parsed = assignWorkItemSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);

    const item = await prisma.workItem.findUnique({ where: { id: itemId } });
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    const managerAccess = await requireTeamRole(request.auth!.userId, item.teamId, TeamRole.MANAGER);
    if (!managerAccess) return apiError(response, 403, "MANAGER_REQUIRED");

    const assigneeMembership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: parsed.data.assigneeId, teamId: item.teamId } },
      include: { user: { select: { isActive: true } } },
    });
    if (!assigneeMembership || assigneeMembership.role !== TeamRole.MEMBER || !assigneeMembership.user.isActive) {
      return apiError(response, 400, "ASSIGNEE_MUST_BE_ACTIVE_TEAM_EMPLOYEE", "Choose an active Employee from this department.");
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
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership) return apiError(response, 403, "TEAM_ACCESS_DENIED");

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
      return apiError(response, 400, "INVALID_COMMENT_ID", "Provide a valid comment id.");
    }

    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership) return apiError(response, 403, "TEAM_ACCESS_DENIED");

    const comment = await prisma.comment.findFirst({ where: { id: commentId, workItemId: itemId } });
    if (!comment) return apiError(response, 404, "COMMENT_NOT_FOUND", "Comment not found.");
    const canModerate = membership.isGlobalAdmin || membership.role === TeamRole.MANAGER;
    if (comment.authorId !== request.auth!.userId && !canModerate) {
      return apiError(response, 403, "COMMENT_DELETE_DENIED", "You cannot delete this comment.");
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
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const parsed = resolutionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership) return apiError(response, 403, "TEAM_ACCESS_DENIED");
    if (membership.role !== TeamRole.MEMBER || membership.isGlobalAdmin || item.assigneeId !== request.auth!.userId) {
      return apiError(response, 403, "OWNER_REQUIRED", "Only the assigned Employee can submit this item for approval.");
    }
    if (!canRequestApproval(item.status as WorkItemStatus, item.approvalRequired)) {
      return apiError(response, 409, item.approvalRequired ? "INVALID_WORKFLOW_TRANSITION" : "APPROVAL_NOT_REQUIRED");
    }

    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Awaiting Approval", resolutionProposal: parsed.data.resolutionProposal }, "APPROVAL_REQUESTED");
    if (!updated) return apiError(response, 409, "STALE_DATA");
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

workItemsRouter.post("/:id/approve", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const parsed = decisionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership || membership.role !== TeamRole.MANAGER) return apiError(response, 403, "MANAGER_REQUIRED");
    if (item.assigneeId === request.auth!.userId) return apiError(response, 409, "APPROVER_MUST_BE_DIFFERENT_USER", "The assignee cannot approve their own work.");
    if (!canDecideApproval(item.status as WorkItemStatus, Boolean(item.resolutionProposal))) {
      return apiError(response, 409, "INVALID_WORKFLOW_TRANSITION");
    }
    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Approved", resolution: item.resolutionProposal, approvedById: request.auth!.userId, approvedAt: new Date() },
      "APPROVED", parsed.data.reason ? { reason: parsed.data.reason } : undefined,
      item.auditLogs[0]?.actorId ?? item.assigneeId
        ? {
            userId: (item.auditLogs[0]?.actorId ?? item.assigneeId)!,
            type: "APPROVAL_APPROVED",
            title: "Work item approved",
            message: `“${item.title}” was approved.`,
          }
        : undefined);
    if (!updated) return apiError(response, 409, "STALE_DATA");
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

workItemsRouter.post("/:id/request-changes", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const parsed = decisionSchema.extend({ reason: z.string().trim().min(3).max(2_000) }).safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership || membership.role !== TeamRole.MANAGER) return apiError(response, 403, "MANAGER_REQUIRED");
    if (item.assigneeId === request.auth!.userId) return apiError(response, 409, "APPROVER_MUST_BE_DIFFERENT_USER", "The assignee cannot decide their own approval.");
    if (!canDecideApproval(item.status as WorkItemStatus, Boolean(item.resolutionProposal))) {
      return apiError(response, 409, "INVALID_WORKFLOW_TRANSITION");
    }
    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Changes Requested" }, "CHANGES_REQUESTED", { reason: parsed.data.reason },
      item.auditLogs[0]?.actorId ?? item.assigneeId
        ? {
            userId: (item.auditLogs[0]?.actorId ?? item.assigneeId)!,
            type: "APPROVAL_REJECTED",
            title: "Approval denied",
            message: `“${item.title}” was denied and returned for changes.`,
          }
        : undefined);
    if (!updated) return apiError(response, 409, "STALE_DATA");
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

workItemsRouter.post("/:id/resolve", async (request, response, next) => {
  try {
    const itemId = parseItemId(request.params.id);
    if (!itemId) return apiError(response, 400, "INVALID_WORK_ITEM_ID", "Provide a valid work item id.");
    const parsed = resolutionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const { item, membership } = await visibleItem(itemId, request.auth!.userId);
    if (!item) return apiError(response, 404, "WORK_ITEM_NOT_FOUND");
    if (!membership) return apiError(response, 403, "TEAM_ACCESS_DENIED");
    if (item.assigneeId !== request.auth!.userId && membership.role !== TeamRole.MANAGER) {
      return apiError(response, 403, "OWNER_REQUIRED");
    }
    if (!canResolve(item.status as WorkItemStatus, item.approvalRequired)) {
      return apiError(response, 409, item.approvalRequired ? "APPROVAL_REQUIRED" : "INVALID_WORKFLOW_TRANSITION");
    }
    const updated = await versionedWorkflowUpdate(itemId, parsed.data.expectedVersion, request.auth!.userId,
      { status: "Resolved", resolution: parsed.data.resolutionProposal }, "RESOLVED");
    if (!updated) return apiError(response, 409, "STALE_DATA");
    return response.json({ item: formatItem(updated) });
  } catch (error) { return next(error); }
});

async function versionedWorkflowUpdate(
  itemId: number,
  expectedVersion: number,
  actorId: string,
  data: Prisma.WorkItemUncheckedUpdateManyInput,
  action: string,
  details?: Prisma.InputJsonValue,
  notification?: { userId: string; type: string; title: string; message: string }
) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.workItem.updateMany({
      where: { id: itemId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    await tx.auditLog.create({ data: { workItemId: itemId, actorId, action, details } });
    if (notification && notification.userId !== actorId) {
      await tx.notification.create({ data: { ...notification, workItemId: itemId } });
    }
    return tx.workItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
  });
}
