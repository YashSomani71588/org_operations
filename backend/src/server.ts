import cors from "cors";
import "dotenv/config";
import express, { Request, Response } from "express";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).json({
    status: "ok",
    service: "org-operations-api",
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
