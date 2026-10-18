import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { authRouter } from "./modules/auth/auth.routes";
import { teamsRouter } from "./modules/teams/teams.routes";
import { workItemsRouter } from "./modules/workitems/workitems.routes";

const app = express();

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

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
});

app.listen(env.PORT, () => {
  console.log(`API running at http://localhost:${env.PORT}`);
});
