import cors from "cors";
import express, { Request, Response } from "express";
import { env } from "./config/env";

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

app.listen(env.PORT, () => {
  console.log(`API running at http://localhost:${env.PORT}`);
});
