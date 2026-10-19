import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { apiError } from "../../lib/api-error";
import { requireAuthentication } from "../../middleware/require-authentication";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuthentication);

notificationsRouter.get("/", async (request, response, next) => {
  try {
    const userId = request.auth!.userId;
    const [notifications, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId },
        include: { workItem: { select: { id: true, title: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return response.json({ notifications, unreadCount });
  } catch (error) {
    return next(error);
  }
});

notificationsRouter.post("/:id/read", async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return apiError(response, 400, "INVALID_NOTIFICATION_ID", "Provide a valid notification id.");
    const result = await prisma.notification.updateMany({
      where: { id, userId: request.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) return apiError(response, 404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});

notificationsRouter.post("/read-all", async (request, response, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: request.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});
