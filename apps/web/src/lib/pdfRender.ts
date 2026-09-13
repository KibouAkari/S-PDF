import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Renders every page of a PDF File to a PNG data URL for thumbnail previews. */
export async function renderPdfThumbnails(
  file: File,
  scale = 0.35
): Promise<{ dataUrl: string; width: number; height: number }[]> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const results: { dataUrl: string; width: number; height: number }[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    results.push({ dataUrl: canvas.toDataURL("image/png"), width: viewport.width, height: viewport.height });
  }

  await doc.cleanup();
  return results;
}

/** Renders a single page at a given scale, returning a canvas element (used by the editor). */
export async function renderPdfPage(file: File, pageIndex: number, scale = 1.5) {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const pageSize = page.getViewport({ scale: 1 });
  await doc.cleanup();
  return { canvas, pdfWidth: pageSize.width, pdfHeight: pageSize.height };
}
