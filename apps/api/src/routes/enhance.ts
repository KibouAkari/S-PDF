import { Router } from "express";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { upload } from "../middleware/upload.js";
import { asyncHandler, HttpError } from "../lib/http.js";

export const enhanceRouter = Router();

/**
 * POST /api/pdf/watermark
 * multipart/form-data: file, text, opacity?, fontSize?, color?, position?, rotationDeg?
 */
enhanceRouter.post(
  "/watermark",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");
    const text = String(req.body.text ?? "").trim();
    if (!text) throw new HttpError(400, "`text` is required");

    const opacity = clamp(Number(req.body.opacity ?? 0.25), 0.02, 1);
    const fontSize = clamp(Number(req.body.fontSize ?? 48), 6, 300);
    const rotationDeg = Number(req.body.rotationDeg ?? 45);
    const position = String(req.body.position ?? "center"); // center | diagonal-tile
    const [r, g, b] = hexToRgb(String(req.body.color ?? "#94A3B8"));

    const doc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      if (position === "tile") {
        const stepX = textWidth + 80;
        const stepY = fontSize + 80;
        for (let y = -stepY; y < height + stepY; y += stepY) {
          for (let x = -stepX; x < width + stepX; x += stepX) {
            page.drawText(text, {
              x, y, size: fontSize, font, color: rgb(r, g, b), opacity, rotate: degrees(rotationDeg),
            });
          }
        }
      } else {
        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height / 2,
          size: fontSize,
          font,
          color: rgb(r, g, b),
          opacity,
          rotate: degrees(rotationDeg),
        });
      }
    }

    const bytes = await doc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="watermarked.pdf"');
    res.send(Buffer.from(bytes));
  })
);

/**
 * POST /api/pdf/page-numbers
 * multipart/form-data: file, position? (bottom-center|bottom-right|bottom-left|top-center|top-right|top-left),
 *                       startAt?, format? (e.g. "Page {n} of {total}")
 */
enhanceRouter.post(
  "/page-numbers",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");

    const position = String(req.body.position ?? "bottom-center");
    const startAt = Number(req.body.startAt ?? 1);
    const format = String(req.body.format ?? "{n}");
    const fontSize = clamp(Number(req.body.fontSize ?? 11), 6, 48);

    const doc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const total = pages.length;
    const margin = 28;

    pages.forEach((page, i) => {
      const label = format
        .replace(/{n}/g, String(startAt + i))
        .replace(/{total}/g, String(total));
      const { width } = page.getSize();
      const textWidth = font.widthOfTextAtSize(label, fontSize);

      const x =
        position.endsWith("left") ? margin :
        position.endsWith("right") ? width - textWidth - margin :
        width / 2 - textWidth / 2;
      const y = position.startsWith("top") ? page.getHeight() - margin : margin - 4;

      page.drawText(label, { x, y, size: fontSize, font, color: rgb(0.25, 0.25, 0.25) });
    });

    const bytes = await doc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="numbered.pdf"');
    res.send(Buffer.from(bytes));
  })
);

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  if (Number.isNaN(bigint)) return [0.58, 0.64, 0.72];
  return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255];
}
