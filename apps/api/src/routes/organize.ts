import { Router } from "express";
import { PDFDocument, degrees } from "pdf-lib";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { upload } from "../middleware/upload.js";
import { asyncHandler, HttpError, parsePageRanges } from "../lib/http.js";

export const organizeRouter = Router();

interface PlanItem {
  fileIndex: number;
  pageIndex: number;
  rotate?: 0 | 90 | 180 | 270;
}

/**
 * POST /api/pdf/organize
 * multipart/form-data:
 *   files: one or more PDFs
 *   plan:  JSON string, array of { fileIndex, pageIndex, rotate }
 * Builds a single output PDF by copying the requested pages, in the given
 * order, from the given source files. This single primitive powers merge,
 * reorder, delete, extract and split-by-selection in the frontend.
 */
organizeRouter.post(
  "/organize",
  upload.array("files"),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new HttpError(400, "No files uploaded");

    let plan: PlanItem[];
    try {
      plan = JSON.parse(String(req.body.plan ?? "[]"));
    } catch {
      throw new HttpError(400, "`plan` must be valid JSON");
    }
    if (!Array.isArray(plan) || plan.length === 0) {
      throw new HttpError(400, "`plan` must be a non-empty array");
    }

    const sourceDocs = await Promise.all(
      files.map((f) => PDFDocument.load(f.buffer, { ignoreEncryption: true }))
    );

    const output = await PDFDocument.create();

    // Group by source file to use pdf-lib's batched copyPages efficiently.
    const byFile = new Map<number, { planIndex: number; item: PlanItem }[]>();
    plan.forEach((item, planIndex) => {
      if (item.fileIndex < 0 || item.fileIndex >= sourceDocs.length) {
        throw new HttpError(400, `Invalid fileIndex ${item.fileIndex} in plan`);
      }
      const list = byFile.get(item.fileIndex) ?? [];
      list.push({ planIndex, item });
      byFile.set(item.fileIndex, list);
    });

    const copiedPages = new Array(plan.length);
    for (const [fileIndex, items] of byFile) {
      const srcDoc = sourceDocs[fileIndex];
      const pageIndices = items.map(({ item }) => item.pageIndex);
      const invalid = pageIndices.find((p) => p < 0 || p >= srcDoc.getPageCount());
      if (invalid !== undefined) {
        throw new HttpError(
          400,
          `Page ${invalid + 1} out of range for file #${fileIndex + 1} (${srcDoc.getPageCount()} pages)`
        );
      }
      const pages = await output.copyPages(srcDoc, pageIndices);
      pages.forEach((page, i) => {
        const { planIndex, item } = items[i];
        if (item.rotate) page.setRotation(degrees(page.getRotation().angle + item.rotate));
        copiedPages[planIndex] = page;
      });
    }

    copiedPages.forEach((page) => output.addPage(page));

    const bytes = await output.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="organized.pdf"');
    res.send(Buffer.from(bytes));
  })
);

/**
 * POST /api/pdf/split
 * multipart/form-data: file (single PDF), ranges (e.g. "1-3,5,8-10")
 * Splits the document into one PDF per comma-separated range and returns a ZIP.
 */
organizeRouter.post(
  "/split",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");
    const rangesSpec = String(req.body.ranges ?? "").trim();
    if (!rangesSpec) throw new HttpError(400, "`ranges` is required");

    const srcDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const pageCount = srcDoc.getPageCount();
    const groups = rangesSpec.split(",").map((s) => s.trim()).filter(Boolean);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="split.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });
    const pass = new PassThrough();
    archive.pipe(pass);
    pass.pipe(res);

    for (let g = 0; g < groups.length; g++) {
      const indices = parsePageRanges(groups[g], pageCount);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(srcDoc, indices);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      archive.append(Buffer.from(bytes), { name: `part-${g + 1}.pdf` });
    }

    await archive.finalize();
  })
);
