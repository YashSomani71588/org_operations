import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { authRouter } from "./modules/auth/auth.routes";
import { teamsRouter } from "./modules/teams/teams.routes";
import { workItemsRouter } from "./modules/workitems/workitems.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";

export const app = express();

app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Health Check
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/work-items", workItemsRouter);
app.use("/api/notifications", notificationsRouter);

// Global Error Handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const diagnostic = err instanceof Error
    ? { name: err.name, message: err.message, stack: env.NODE_ENV === "production" ? undefined : err.stack }
    : { name: "UnknownError" };
  console.error("Unexpected server failure", { method: req.method, path: req.path, diagnostic });
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." });
});

if (require.main === module) {
  app.listen(env.PORT, () => {
    console.log(`API running at http://localhost:${env.PORT}`);
  });
}
