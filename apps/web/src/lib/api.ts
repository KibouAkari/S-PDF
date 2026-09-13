import axios, { AxiosError } from "axios";

export const api = axios.create({ baseURL: "/api" });

/**
 * Axios responseType:'blob' means server JSON error bodies also arrive as a
 * Blob. This unwraps them so extractErrorMessage() can read `error` from JSON.
 */
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const data = error.response?.data;
    if (data instanceof Blob && data.type.includes("json")) {
      try {
        const text = await data.text();
        error.response!.data = JSON.parse(text);
      } catch {
        // leave as-is if it isn't parseable JSON
      }
    }
    return Promise.reject(error);
  }
);

export interface OrganizePlanItem {
  fileIndex: number;
  pageIndex: number;
  rotate?: 0 | 90 | 180 | 270;
}

export async function organizePdf(files: File[], plan: OrganizePlanItem[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("plan", JSON.stringify(plan));
  const res = await api.post("/pdf/organize", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function splitPdf(file: File, ranges: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("ranges", ranges);
  const res = await api.post("/pdf/split", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function watermarkPdf(
  file: File,
  opts: { text: string; opacity?: number; fontSize?: number; color?: string; position?: string; rotationDeg?: number }
) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(opts).forEach(([k, v]) => v !== undefined && form.append(k, String(v)));
  const res = await api.post("/pdf/watermark", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function pageNumbersPdf(
  file: File,
  opts: { position?: string; startAt?: number; format?: string; fontSize?: number }
) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(opts).forEach(([k, v]) => v !== undefined && form.append(k, String(v)));
  const res = await api.post("/pdf/page-numbers", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function imagesToPdf(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await api.post("/pdf/images-to-pdf", form, { responseType: "blob" });
  return res.data as Blob;
}

export interface PdfInfo {
  pageCount: number;
  pages: { width: number; height: number; rotation: number }[];
}

export async function pdfInfo(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post("/pdf/info", form);
  return res.data as PdfInfo;
}

export type EditObject =
  | { type: "rect"; page: number; x: number; y: number; width: number; height: number; color?: string }
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
  | { type: "image"; page: number; x: number; y: number; width: number; height: number; dataUrl: string };

export async function editPdf(file: File, objects: EditObject[]) {
  const form = new FormData();
  form.append("file", file);
  form.append("objects", JSON.stringify(objects));
  const res = await api.post("/pdf/edit", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function pdfToWord(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post("/convert/pdf-to-word", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function wordToPdf(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post("/convert/word-to-pdf", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function pdfToImages(file: File, dpi = 150) {
  const form = new FormData();
  form.append("file", file);
  form.append("dpi", String(dpi));
  const res = await api.post("/convert/pdf-to-images", form, { responseType: "blob" });
  return res.data as Blob;
}

export async function compressPdf(file: File, level: "low" | "medium" | "high" = "medium") {
  const form = new FormData();
  form.append("file", file);
  form.append("level", level);
  const res = await api.post("/convert/compress", form, { responseType: "blob" });
  return res.data as Blob;
}
