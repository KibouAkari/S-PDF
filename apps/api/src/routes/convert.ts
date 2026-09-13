import { Router } from "express";
import FormData from "form-data";
import fetch from "node-fetch";
import { upload } from "../middleware/upload.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { config } from "../config.js";

export const convertRouter = Router();

async function forwardToConverter(
  path: string,
  file: Express.Multer.File,
  extraFields: Record<string, string> = {}
) {
  const form = new FormData();
  form.append("file", file.buffer, { filename: file.originalname, contentType: file.mimetype });
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);

  const response = await fetch(`${config.converterUrl}${path}`, {
    method: "POST",
    // node-fetch accepts a form-data instance directly as the request body.
    body: form as never,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HttpError(response.status, `Converter service error: ${text || response.statusText}`);
  }
  return response;
}

/** POST /api/convert/pdf-to-word — multipart: file (PDF) → returns .docx */
convertRouter.post(
  "/pdf-to-word",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");
    const response = await forwardToConverter("/convert/pdf-to-word", req.file);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="converted.docx"');
    res.send(Buffer.from(await response.arrayBuffer()));
  })
);

/** POST /api/convert/word-to-pdf — multipart: file (docx) → returns .pdf */
convertRouter.post(
  "/word-to-pdf",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");
    const response = await forwardToConverter("/convert/word-to-pdf", req.file);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="converted.pdf"');
    res.send(Buffer.from(await response.arrayBuffer()));
  })
);

/** POST /api/convert/pdf-to-images — multipart: file (PDF), dpi? → returns .zip of PNGs */
convertRouter.post(
  "/pdf-to-images",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");
    const dpi = String(req.body.dpi ?? "150");
    const response = await forwardToConverter("/convert/pdf-to-images", req.file, { dpi });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="pages.zip"');
    res.send(Buffer.from(await response.arrayBuffer()));
  })
);

/** POST /api/convert/compress — multipart: file (PDF), level? (low|medium|high) → returns compressed .pdf */
convertRouter.post(
  "/compress",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");
    const level = String(req.body.level ?? "medium");
    const response = await forwardToConverter("/convert/compress", req.file, { level });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="compressed.pdf"');
    res.send(Buffer.from(await response.arrayBuffer()));
  })
);
