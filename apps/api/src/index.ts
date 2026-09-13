import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { organizeRouter } from "./routes/organize.js";
import { enhanceRouter } from "./routes/enhance.js";
import { utilityRouter } from "./routes/utility.js";
import { editRouter } from "./routes/edit.js";
import { convertRouter } from "./routes/convert.js";
import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { HttpError } from "./lib/http.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/pdf", organizeRouter);
app.use("/api/pdf", enhanceRouter);
app.use("/api/pdf", utilityRouter);
app.use("/api/pdf", editRouter);
app.use("/api/convert", convertRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler — keep last.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof MulterError) {
    return res.status(400).json({ error: err.message });
  }
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Internal server error";
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`S-PDF API listening on http://localhost:${config.port}`);
});
