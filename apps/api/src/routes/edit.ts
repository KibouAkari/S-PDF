import { Router } from "express";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { upload } from "../middleware/upload.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { config } from "../config.js";
import FormData from "form-data";
import fetch from "node-fetch";

export const editRouter = Router();

async function converterRequest(path: string, file: Express.Multer.File, fields: Record<string, string>) {
  const form = new FormData();
  form.append("file", file.buffer, { filename: file.originalname, contentType: "application/pdf" });
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  let response;
  try {
    response = await fetch(config.converterUrl + path, {
      method: "POST",
      body: form as never,
      headers: form.getHeaders(),
    });
  } catch {
    throw new HttpError(503, "PDF content editor requires the running Python converter service");
  }
  if (!response.ok) {
    let reason = await response.text();
    try {
      const parsed = JSON.parse(reason);
      reason = String(parsed.detail ?? parsed.error ?? reason);
    } catch { /* returned plain text */ }
    throw new HttpError(response.status, reason.slice(0, 500));
  }
  return response;
}

/** Identify selectable original PDF text/image objects. */
editRouter.post("/content", upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "No file uploaded");
  const page = Number(req.body.page ?? 0);
  if (!Number.isInteger(page) || page < 0) throw new HttpError(400, "Invalid page");
  const response = await converterRequest("/api/pdf/content", req.file, { page: String(page) });
  res.json(await response.json());
}));


type EditObject =
  | { type: "rect" | "highlight"; page: number; x: number; y: number; width: number; height: number; color?: string }
  | {
      type: "text";
      page: number;
      x: number;
      y: number;
      text: string;
      size?: number;
      color?: string;
      font?: "helvetica" | "times" | "courier";
      bold?: boolean;
      italic?: boolean;
    }
  | { type: "image"; page: number; x: number; y: number; width: number; height: number; dataUrl: string }
  | { type: "source"; page: number; elementId: string; action: "replace" | "move" | "delete"; x: number; y: number; width: number; height: number; text?: string; size?: number; font?: string; color?: string; bold?: boolean; italic?: boolean };

const FONT_MAP = {
  helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
} as const;

/**
 * POST /api/pdf/edit
 * multipart/form-data: file, objects (JSON string, array of EditObject)
 * Flattens new text/images/redaction-rectangles onto the existing pages.
 * Coordinates are in PDF space (origin bottom-left) matching /api/pdf/info.
 */
editRouter.post(
  "/edit",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");

    let objects: EditObject[];
    try {
      objects = JSON.parse(String(req.body.objects ?? "[]"));
    } catch {
      throw new HttpError(400, "`objects` must be valid JSON");
    }
    if (!Array.isArray(objects)) throw new HttpError(400, "`objects` must be an array");
    if (objects.length > 1000) throw new HttpError(400, "Too many editor objects");
    if (objects.some((item) => item?.type === "source")) {
      const response = await converterRequest("/api/pdf/edit", file, { objects: JSON.stringify(objects) });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="edited.pdf"');
      res.send(Buffer.from(await response.arrayBuffer()));
      return;
    }

    const doc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const pages = doc.getPages();
    const fontCache = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>();
    const imageCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

    for (const obj of objects) {
      if (obj.page < 0 || obj.page >= pages.length) {
        throw new HttpError(400, `Object references invalid page ${obj.page}`);
      }
      const page = pages[obj.page];

      if (obj.type === "rect" || obj.type === "highlight") {
        const [r, g, b] = hexToRgb(obj.color ?? "#FFFFFF");
        page.drawRectangle({ x: obj.x, y: obj.y, width: obj.width, height: obj.height, color: rgb(r, g, b), opacity: obj.type === "highlight" ? 0.32 : 1 });
      } else if (obj.type === "text") {
        const family = obj.font ?? "helvetica";
        const variant = obj.bold && obj.italic ? "boldItalic" : obj.bold ? "bold" : obj.italic ? "italic" : "regular";
        const key = `${family}-${variant}`;
        let font = fontCache.get(key);
        if (!font) {
          font = await doc.embedFont(FONT_MAP[family][variant]);
          fontCache.set(key, font);
        }
        const [r, g, b] = hexToRgb(obj.color ?? "#000000");
        page.drawText(obj.text, { x: obj.x, y: obj.y, size: obj.size ?? 14, font, color: rgb(r, g, b) });
      } else if (obj.type === "image") {
        let img = imageCache.get(obj.dataUrl);
        if (!img) {
          const isPng = obj.dataUrl.startsWith("data:image/png");
          const base64 = obj.dataUrl.split(",")[1] ?? "";
          const bytes = Buffer.from(base64, "base64");
          img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          imageCache.set(obj.dataUrl, img);
        }
        page.drawImage(img, { x: obj.x, y: obj.y, width: obj.width, height: obj.height });
      }
    }

    const bytes = await doc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="edited.pdf"');
    res.send(Buffer.from(bytes));
  })
);

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (Number.isNaN(bigint)) return [0, 0, 0];
  return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255];
}
