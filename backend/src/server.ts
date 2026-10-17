import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { authRouter } from "./modules/auth/auth.routes";

const app = express();

app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

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

app.use("/api/auth", authRouter);

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    console.error(error);

    response.status(500).json({
      error: "INTERNAL_SERVER_ERROR"
    });
  }
);

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.listen(env.PORT, () => {
  console.log(`API running at http://localhost:${env.PORT}`);
});