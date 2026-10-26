import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, Textbox, Rect, FabricImage, type FabricObject } from "fabric";
import { Type, Square, Highlighter, ImagePlus, Trash2, Download, ZoomIn, ZoomOut, Maximize2, Hand, MousePointer2 } from "lucide-react";
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
  if (kind === "rect" || kind === "highlight") {
    return {
      type: kind,
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
  if (data.spdfType === "rect" || data.spdfType === "highlight") {
    const rect = new Rect(data);
    if (data.spdfType === "highlight") rect.setControlsVisibility({ mtr: false });
    return rect;
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
  const [zoom, setZoom] = useState(1);
  const [pagePixels, setPagePixels] = useState({ width: 0, height: 0 });
  const [panMode, setPanMode] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const loadingPageRef = useRef(0);

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

      const request = ++loadingPageRef.current;
      const { canvas: rendered } = await renderPdfPage(file, pageIndex, RENDER_SCALE);
      if (request !== loadingPageRef.current || fabricRef.current !== canvas) return;
      setPagePixels({ width: rendered.width, height: rendered.height });
      const view = viewportRef.current;
      if (view && pageIndex === 0) {
        const fit = Math.min((view.clientWidth - 48) / rendered.width, (view.clientHeight - 48) / rendered.height);
        setZoom(Math.max(0.2, Math.min(2.5, fit)));
      }
      canvas.setDimensions({ width: rendered.width, height: rendered.height });
      const bgUrl = rendered.toDataURL("image/png");
      const bg = await FabricImage.fromURL(bgUrl);
      if (request !== loadingPageRef.current || fabricRef.current !== canvas) return;
      canvas.backgroundImage = bg;
      canvas.remove(...canvas.getObjects());

      const saved = pageObjectsRef.current.get(pageIndex) ?? [];
      for (const data of saved) {
        const obj = await loadObjectByType(data);
        if (request !== loadingPageRef.current || fabricRef.current !== canvas) return;
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
    loadingPageRef.current++;
    pageObjectsRef.current = new Map();
    currentPageRef.current = 0;
    fabricRef.current?.remove(...(fabricRef.current?.getObjects() ?? []));
    setPageCount(0);
    setThumbs([]);
    setPagePixels({ width: 0, height: 0 });
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

  function fitPage() {
    const viewport = viewportRef.current;
    if (!viewport || !pagePixels.width || !pagePixels.height) return;
    const availableWidth = Math.max(200, viewport.clientWidth - 48);
    const availableHeight = Math.max(200, viewport.clientHeight - 48);
    setZoom(Math.max(0.2, Math.min(2.5, availableWidth / pagePixels.width, availableHeight / pagePixels.height)));
    viewport.scrollTo({ top: 0, left: 0 });
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!panMode || !viewportRef.current) return;
    const el = viewportRef.current;
    dragRef.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(event.pointerId);
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    const el = viewportRef.current;
    if (!start || !el) return;
    el.scrollLeft = start.left - (event.clientX - start.x);
    el.scrollTop = start.top - (event.clientY - start.y);
  }

  function stopPan() { dragRef.current = null; }

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
    canvas.requestRenderAll();
  }

  function addRect() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rect = new Rect({ left: 60, top: 60, width: 160, height: 40, fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1 });
    (rect as FabricObject & { spdfType?: string }).spdfType = "rect";
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
  }

  function addHighlight() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rect = new Rect({ left: 60, top: 60, width: 190, height: 22, fill: "#facc15", opacity: 0.32, strokeWidth: 0 });
    (rect as FabricObject & { spdfType?: string }).spdfType = "highlight";
    rect.setControlsVisibility({ mtr: false });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
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
    canvas.requestRenderAll();
  }

  function deleteSelected() {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (canvas && active) { canvas.remove(active); canvas.requestRenderAll(); }
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

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = !panMode;
    canvas.skipTargetFind = panMode;
    canvas.forEachObject((obj) => { obj.selectable = !panMode; obj.evented = !panMode; });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [panMode, currentPage]);

  if (!file) {
    return (
      <div>
        <ToolHeader title="Edit PDF" description="Add and position annotations over PDF pages. Existing document text is not directly editable yet." />
        <Card className="p-6">
          <Dropzone accept="application/pdf" onFiles={(files) => handleFile(files[0])} hint="Choose a PDF to start editing" />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ToolHeader title="Edit PDF" description="Add and move text, images, highlights and shapes. Existing text remains part of the original PDF." />
        <Button onClick={handleSave} disabled={status === "loading"}>
          <Download className="h-4 w-4" /> Save & Download
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={addText}><Type className="h-4 w-4" /> Add text</Button>
        <Button variant="secondary" size="sm" onClick={addHighlight}><Highlighter className="h-4 w-4" /> Highlight</Button>
        <Button variant="secondary" size="sm" onClick={addRect}><Square className="h-4 w-4" /> Add white box</Button>
        <label>
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files && addImage(Array.from(e.target.files))} />
          <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-ink-50 hover:bg-ink-700">
            <ImagePlus className="h-4 w-4" /> Add image
          </span>
        </label>
        <Button variant="danger" size="sm" onClick={deleteSelected}><Trash2 className="h-4 w-4" /> Delete selected</Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="PDF viewport controls">
        <Button size="sm" variant="secondary" onClick={() => setPanMode(false)}><MousePointer2 className="h-4 w-4" /> Select</Button>
        <Button size="sm" variant="secondary" onClick={() => setPanMode(true)}><Hand className="h-4 w-4" /> Pan {panMode ? "✓" : ""}</Button>
        <Button size="sm" variant="secondary" onClick={() => setZoom((v) => Math.max(0.2, +(v - 0.15).toFixed(2)))}><ZoomOut className="h-4 w-4" /> Zoom out</Button>
        <span className="min-w-14 text-center text-sm text-ink-300">{Math.round(zoom * RENDER_SCALE * 100)}%</span>
        <Button size="sm" variant="secondary" onClick={() => setZoom((v) => Math.min(2.5, +(v + 0.15).toFixed(2)))}><ZoomIn className="h-4 w-4" /> Zoom in</Button>
        <Button size="sm" variant="secondary" onClick={fitPage}><Maximize2 className="h-4 w-4" /> Fit page</Button>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
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

        <Card className="min-w-0 overflow-hidden p-0">
          <div
            ref={viewportRef}
            className={cn("relative h-[min(74vh,850px)] min-h-[420px] w-full overflow-auto p-4", panMode ? "cursor-grab active:cursor-grabbing" : "")}
            style={{ touchAction: panMode ? "none" : "auto" }}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={stopPan}
            onPointerCancel={stopPan}
          >
            <div className="flex min-h-full min-w-full w-max items-start justify-center">
              <div className="relative shrink-0 overflow-hidden" style={{ width: pagePixels.width * zoom, height: pagePixels.height * zoom }}>
                <div style={{ width: pagePixels.width, height: pagePixels.height, transform: `scale(${zoom})`, transformOrigin: "top left", pointerEvents: panMode ? "none" : "auto" }}>
                  <canvas ref={attachCanvas} className="rounded-sm shadow-lg" />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <p className="mt-2 text-xs text-ink-400">Page {currentPage + 1} of {pageCount}. Use Select to move added objects, Pan to move around the page, and Fit page to see the whole document. Scanned text is part of an image and cannot yet be edited directly.</p>

      <div className="mt-4">
        <StatusBanner state={status} message={message} />
      </div>
    </div>
  );
}
