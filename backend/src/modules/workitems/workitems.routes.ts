import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../../lib/prisma";

export const workItemsRouter = Router();

function formatItem(item: any) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    team: item.team,
    team_id: 1,
    assignee_id: item.assigneeId,
    assignee_name: item.assignee?.fullName || "Unassigned",
    version: item.version,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
    due_at: item.dueAt ? item.dueAt.toISOString() : null,
  };
}

// 1. GET ALL ITEMS
workItemsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, status, priority, team } = req.query;

    const where: any = {};
    if (status && status !== "All statuses") where.status = status as string;
    if (priority && priority !== "All priorities") where.priority = priority as string;
    if (team && team !== "All teams") where.team = team as string;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const items = await (prisma as any).workItem.findMany({
      where,
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json({
      items: items.map(formatItem),
      total: items.length,
    });
  } catch (error) {
    return next(error);
  }
});

// 2. CREATE ITEM
workItemsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, priority, team } = req.body;

    if (!title || title.trim().length < 5) {
      return res.status(400).json({ error: "Title must be at least 5 characters." });
    }

    const newItem = await (prisma as any).workItem.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || "Medium",
        team: team || "Operations",
        status: "Open",
        version: 1,
      },
    });

    await (prisma as any).auditLog.create({
      data: {
        workItemId: newItem.id,
        action: "CREATED",
        details: { title: newItem.title, priority: newItem.priority },
      },
    });

    return res.status(201).json({ item: formatItem(newItem) });
  } catch (error) {
    return next(error);
  }
});

// 3. UPDATE STATUS (With OCC Version Check)
workItemsRouter.patch("/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = parseInt(req.params.id as string, 10);
    const { status, expectedVersion } = req.body;

    const current = await (prisma as any).workItem.findUnique({ where: { id: itemId } });
    if (!current) return res.status(404).json({ error: "Work item not found" });

    // OCC Version Check: prevents concurrent overwriting
    if (current.version !== expectedVersion) {
      return res.status(409).json({
        error: "STALE_DATA",
        message: "This work item was modified by another user concurrently.",
        serverVersion: current.version,
        currentStatus: current.status,
      });
    }

    const updated = await (prisma as any).workItem.update({
      where: { id: itemId },
      data: {
        status,
        version: { increment: 1 },
      },
      include: { assignee: true },
    });

    await (prisma as any).auditLog.create({
      data: {
        workItemId: updated.id,
        action: "STATUS_CHANGED",
        details: { fromStatus: current.status, toStatus: updated.status, version: updated.version },
      },
    });

    return res.status(200).json({ item: formatItem(updated) });
  } catch (error) {
    return next(error);
  }
});

// 4. ATOMIC CLAIM
workItemsRouter.post("/:id/claim", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = parseInt(req.params.id as string, 10);
    const userId = (req as any).auth?.userId;

    const result = await (prisma as any).workItem.updateMany({
      where: { id: itemId, assigneeId: null },
      data: {
        assigneeId: userId || null,
        status: "In Progress",
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await (prisma as any).workItem.findUnique({ where: { id: itemId }, include: { assignee: true } });
      return res.status(409).json({
        error: "ALREADY_CLAIMED",
        message: `This item was already claimed by ${current?.assignee?.fullName || "another member"}.`,
      });
    }

    const updated = await (prisma as any).workItem.findUnique({ where: { id: itemId }, include: { assignee: true } });
    return res.status(200).json({ item: formatItem(updated) });
  } catch (error) {
    return next(error);
  }
});