import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authRouter } from "./modules/auth/auth.routes";
import { workItemsRouter } from "./modules/workitems/workitems.routes";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
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
app.use("/api/work-items", workItemsRouter);

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 API successfully running at http://localhost:${PORT}`);
});