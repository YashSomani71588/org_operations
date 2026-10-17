import cors from "cors";
import express, { Request, Response } from "express";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

const app = express();

app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json());

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).json({
    status: "ok",
    service: "org-operations-api",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get("/health/database", async (_request: Request, response: Response) => {
  const userCount = await prisma.user.count();

  response.status(200).json({
    status: "ok",
    database: "connected",
    userCount
  });
});

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.listen(env.PORT, () => {
  console.log(`API running at http://localhost:${env.PORT}`);
});
