import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, Textbox, Rect, FabricImage, type FabricObject } from "fabric";
import { Type, Square, ImagePlus, Trash2, Download } from "lucide-react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { pdfInfo, editPdf, type EditObject } from "../../lib/api";
import { renderPdfPage, renderPdfThumbnails } from "../../lib/pdfRender";
import { downloadBlob, extractErrorMessage, cn } from "../../lib/utils";

const RENDER_SCALE = 1.5;

/** Extracts our lightweight EditObject description from a fabric object's on-canvas geometry. */
function fabricObjectToEditObject(obj: FabricObject, page: number, pdfHeight: number): EditObject | null {
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  const scaleX = obj.scaleX ?? 1;
  const scaleY = obj.scaleY ?? 1;
  const width = (obj.width ?? 0) * scaleX;
  const height = (obj.height ?? 0) * scaleY;

  const x = left / RENDER_SCALE;
  const yTopDown = top + height; // bottom edge of the bounding box, in canvas space
  const y = pdfHeight - yTopDown / RENDER_SCALE;

  const kind = (obj as FabricObject & { spdfType?: string }).spdfType;

  if (kind === "text") {
    const tb = obj as Textbox;
    return {
      type: "text",
      page,
      x,
      y,
      text: tb.text ?? "",
      size: ((tb.fontSize ?? 16) * scaleY) / RENDER_SCALE,
      color: String(tb.fill ?? "#000000"),
      font: "helvetica",
      bold: tb.fontWeight === "bold" || tb.fontWeight === 700,
      italic: tb.fontStyle === "italic",
    };
  }
  if (kind === "rect") {
    return {
      type: "rect",
      page,
      x,
      y,
      width: width / RENDER_SCALE,
      height: height / RENDER_SCALE,
      color: String((obj as Rect).fill ?? "#ffffff"),
    };
  }
  if (kind === "image") {
    const dataUrl = (obj as FabricObject & { spdfSrc?: string }).spdfSrc;
    if (!dataUrl) return null;
    return {
      type: "image",
      page,
      x,
      y,
      width: width / RENDER_SCALE,
      height: height / RENDER_SCALE,
      dataUrl,
    };
  }
  return null;
}

async function loadObjectByType(data: Record<string, unknown>): Promise<FabricObject | null> {
  if (data.spdfType === "text") {
    return new Textbox(String(data.text ?? ""), data);
  }
  if (data.spdfType === "rect") {
    return new Rect(data);
  }
  if (data.spdfType === "image" && typeof data.spdfSrc === "string") {
    const img = await FabricImage.fromURL(data.spdfSrc);
    img.set(data);
    return img;
  }
  return null;
}

export function Editor() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  const fabricRef = useRef<Canvas | null>(null);
  const pageObjectsRef = useRef<Map<number, Record<string, unknown>[]>>(new Map());
  const currentPageRef = useRef(0);

  const loadPage = useCallback(
    async (pageIndex: number) => {
      if (!file || !fabricRef.current) return;
      const canvas = fabricRef.current;

      // Persist whatever is currently on the canvas before switching away.
      const prevPage = currentPageRef.current;
      pageObjectsRef.current.set(
        prevPage,
        canvas.getObjects().map((o) => o.toObject(["spdfType", "spdfSrc"]) as Record<string, unknown>)
      );

      const { canvas: rendered } = await renderPdfPage(file, pageIndex, RENDER_SCALE);
      canvas.setDimensions({ width: rendered.width, height: rendered.height });
      const bgUrl = rendered.toDataURL("image/png");
      const bg = await FabricImage.fromURL(bgUrl);
      canvas.backgroundImage = bg;
      canvas.remove(...canvas.getObjects());

      const saved = pageObjectsRef.current.get(pageIndex) ?? [];
      for (const data of saved) {
        const obj = await loadObjectByType(data);
        if (obj) canvas.add(obj);
      }

      canvas.requestRenderAll();
      currentPageRef.current = pageIndex;
      setCurrentPage(pageIndex);
    },
    [file]
  );

  // A callback ref (not useEffect) so Fabric initializes exactly when the
  // <canvas> element mounts — it only exists in the DOM once a file is loaded,
  // so a mount-only effect would run too early and never see the element.
  const attachCanvas = useCallback((el: HTMLCanvasElement | null) => {
    if (el) {
      fabricRef.current = new Canvas(el, { preserveObjectStacking: true });
    } else if (fabricRef.current) {
      fabricRef.current.dispose();
      fabricRef.current = null;
    }
  }, []);

  async function handleFile(f: File) {
    setFile(f);
    setStatus("loading");
    setMessage("Loading document…");
    try {
      const info = await pdfInfo(f);
      setPageCount(info.pageCount);
      setPageSizes(info.pages);
      const thumbData = await renderPdfThumbnails(f, 0.25);
      setThumbs(thumbData.map((t) => t.dataUrl));
      pageObjectsRef.current = new Map();
      currentPageRef.current = 0;
      setStatus("idle");
      setMessage(undefined);
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  // Load the first page once the file + canvas are both ready.
  useEffect(() => {
    if (file && fabricRef.current && pageCount > 0) {
      void loadPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, pageCount]);

  function addText() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const tb = new Textbox("Double-click to edit", {
      left: 60,
      top: 60,
      width: 220,
      fontSize: 20,
      fill: "#111111",
    });
    (tb as FabricObject & { spdfType?: string }).spdfType = "text";
    canvas.add(tb);
    canvas.setActiveObject(tb);
  }

  function addRect() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rect = new Rect({ left: 60, top: 60, width: 160, height: 40, fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1 });
    (rect as FabricObject & { spdfType?: string }).spdfType = "rect";
    canvas.add(rect);
    canvas.setActiveObject(rect);
  }

  async function addImage(files: File[]) {
    const canvas = fabricRef.current;
    const f = files[0];
    if (!canvas || !f) return;
    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(f);
    });
    const img = await FabricImage.fromURL(dataUrl);
    img.scaleToWidth(200);
    img.set({ left: 80, top: 80 });
    (img as FabricObject & { spdfType?: string; spdfSrc?: string }).spdfType = "image";
    (img as FabricObject & { spdfType?: string; spdfSrc?: string }).spdfSrc = dataUrl;
    canvas.add(img);
    canvas.setActiveObject(img);
  }

  function deleteSelected() {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (canvas && active) canvas.remove(active);
  }

  async function handleSave() {
    if (!file || !fabricRef.current) return;
    setStatus("loading");
    setMessage("Flattening your edits into the PDF…");
    try {
      const canvas = fabricRef.current;
      pageObjectsRef.current.set(
        currentPageRef.current,
        canvas.getObjects().map((o) => o.toObject(["spdfType", "spdfSrc"]) as Record<string, unknown>)
      );

      const allObjects: EditObject[] = [];
      for (const [pageIndex, objs] of pageObjectsRef.current) {
        const size = pageSizes[pageIndex];
        if (!size) continue;
        for (const raw of objs) {
          const fake = raw as unknown as FabricObject;
          const converted = fabricObjectToEditObject(fake, pageIndex, size.height);
          if (converted) allObjects.push(converted);
        }
      }

      const blob = await editPdf(file, allObjects);
      downloadBlob(blob, file.name.replace(/\.pdf$/i, "") + "-edited.pdf");
      setStatus("success");
      setMessage("Done! Your edited PDF is downloading.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  if (!file) {
    return (
      <div>
        <ToolHeader title="Edit PDF" description="Add and move text, images, and shapes directly on the page." />
        <Card className="p-6">
          <Dropzone accept="application/pdf" onFiles={(files) => handleFile(files[0])} hint="Choose a PDF to start editing" />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ToolHeader title="Edit PDF" description="Add text, images and shapes, then export your edited PDF." />
        <Button onClick={handleSave} disabled={status === "loading"}>
          <Download className="h-4 w-4" /> Save & Download
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={addText}><Type className="h-4 w-4" /> Add text</Button>
        <Button variant="secondary" size="sm" onClick={addRect}><Square className="h-4 w-4" /> Add box / redact</Button>
        <label>
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files && addImage(Array.from(e.target.files))} />
          <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-ink-50 hover:bg-ink-700">
            <ImagePlus className="h-4 w-4" /> Add image
          </span>
        </label>
        <Button variant="danger" size="sm" onClick={deleteSelected}><Trash2 className="h-4 w-4" /> Delete selected</Button>
      </div>

      <div className="grid grid-cols-[120px_1fr] gap-4">
        <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
          {thumbs.map((src, i) => (
            <button
              key={i}
              onClick={() => loadPage(i)}
              className={cn(
                "overflow-hidden rounded-lg border-2 transition-colors",
                i === currentPage ? "border-brand-400" : "border-ink-700 hover:border-ink-500"
              )}
            >
              <img src={src} alt={`Page ${i + 1}`} className="w-full" />
            </button>
          ))}
        </div>

        <Card className="flex justify-center overflow-auto p-4">
          <canvas ref={attachCanvas} className="rounded-lg shadow-lg" />
        </Card>
      </div>

      <p className="mt-2 text-xs text-ink-400">Page {currentPage + 1} of {pageCount}</p>

      <div className="mt-4">
        <StatusBanner state={status} message={message} />
      </div>
    </div>
  );
}
