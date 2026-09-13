import { Router } from "express";
import { PDFDocument } from "pdf-lib";
import { upload } from "../middleware/upload.js";
import { asyncHandler, HttpError } from "../lib/http.js";

export const utilityRouter = Router();

/**
 * POST /api/pdf/images-to-pdf
 * multipart/form-data: files (one or more PNG/JPEG images), one page per image, fitted to A4 by default.
 */
utilityRouter.post(
  "/images-to-pdf",
  upload.array("files"),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new HttpError(400, "No images uploaded");

    const doc = await PDFDocument.create();
    const PAGE_W = 595.28; // A4 at 72dpi
    const PAGE_H = 841.89;

    for (const file of files) {
      const isPng = file.mimetype === "image/png";
      const image = isPng ? await doc.embedPng(file.buffer) : await doc.embedJpg(file.buffer);
      const page = doc.addPage([PAGE_W, PAGE_H]);
      const margin = 24;
      const maxW = PAGE_W - margin * 2;
      const maxH = PAGE_H - margin * 2;
      const scale = Math.min(maxW / image.width, maxH / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      page.drawImage(image, {
        x: (PAGE_W - w) / 2,
        y: (PAGE_H - h) / 2,
        width: w,
        height: h,
      });
    }

    const bytes = await doc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="images.pdf"');
    res.send(Buffer.from(bytes));
  })
);

/**
 * POST /api/pdf/info
 * multipart/form-data: file
 * Returns page count and per-page dimensions/rotation — useful for building
 * the client-side page-organizer UI without a round trip per operation.
 */
utilityRouter.post(
  "/info",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");
    const doc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const pages = doc.getPages().map((p) => ({
      width: p.getWidth(),
      height: p.getHeight(),
      rotation: p.getRotation().angle,
    }));
    res.json({ pageCount: doc.getPageCount(), pages });
  })
);
