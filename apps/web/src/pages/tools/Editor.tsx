import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, Textbox, Rect, Ellipse, Line, PencilBrush, FabricImage, type FabricObject } from "fabric";
import { Type, Square, Highlighter, ImagePlus, Trash2, Download, ZoomIn, ZoomOut, Maximize2, Hand, MousePointer2, Circle, Minus, PenLine, Undo2, Redo2, Bold, Italic } from "lucide-react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { pdfInfo, editPdf, inspectPdfContent, type NativePdfElement, type EditObject } from "../../lib/api";
import { renderPdfPage, renderPdfThumbnails } from "../../lib/pdfRender";
import { downloadBlob, extractErrorMessage, cn } from "../../lib/utils";

const RENDER_SCALE = 1.5;
const SERIALIZED_PROPS = ["spdfType", "spdfSrc", "spdfId", "spdfKind", "spdfOriginalRect", "spdfText", "spdfFont", "spdfSize", "spdfColor", "spdfBold", "spdfItalic", "spdfChanged", "spdfAction"] as const;
type Editable = FabricObject & {
  spdfType?: string;
  spdfSrc?: string;
  spdfId?: string;
  spdfKind?: "text" | "image" | "shape";
  spdfOriginalRect?: [number, number, number, number];
  spdfText?: string;
  spdfFont?: "helvetica" | "times" | "courier";
  spdfSize?: number;
  spdfColor?: string;
  spdfBold?: boolean;
  spdfItalic?: boolean;
  spdfChanged?: boolean;
  spdfAction?: "replace" | "move" | "delete";
};
function serialize(canvas: Canvas) {
  return canvas.getObjects().map((o) => o.toObject([...SERIALIZED_PROPS]) as Record<string, unknown>);
}
function nativeObject(item: NativePdfElement): Editable {
  const [x0, y0, x1, y1] = item.rect;
  const rectangle = new Rect({
    left: x0 * RENDER_SCALE, top: y0 * RENDER_SCALE,
    width: (x1 - x0) * RENDER_SCALE, height: (y1 - y0) * RENDER_SCALE,
    fill: "rgba(20,184,166,0.005)", strokeWidth: 0,
    lockRotation: true,
  }) as Editable;
  rectangle.spdfType = "source";
  rectangle.spdfId = item.id;
  rectangle.spdfKind = item.type;
  rectangle.spdfOriginalRect = item.rect;
  rectangle.spdfText = item.text || "";
  rectangle.spdfSize = item.fontSize || 12;
  rectangle.spdfColor = item.color || "#000000";
  rectangle.spdfFont = "helvetica";
  rectangle.spdfChanged = false;
  return rectangle;
}


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

  if (kind === "source") {
    const native = obj as Editable;
    if (!native.spdfChanged || !native.spdfId || !native.spdfOriginalRect) return null;
    return {
      type: "source", page, elementId: native.spdfId,
      action: native.spdfAction || "move",
      x: left / RENDER_SCALE, y: top / RENDER_SCALE,
      width: width / RENDER_SCALE, height: height / RENDER_SCALE,
      text: native instanceof Textbox ? native.text : native.spdfText,
      size: native.spdfSize || 12,
      color: native.spdfColor || "#000000",
      font: native.spdfFont || "helvetica",
      bold: native.spdfBold || false, italic: native.spdfItalic || false,
    };
  }
  if (kind === "shape" || kind === "draw") {
    return { type: "image", page, x, y, width: width / RENDER_SCALE,
      height: height / RENDER_SCALE, dataUrl: obj.toDataURL({ format: "png" }) };
  }
  if (kind === "text") {
    const tb = obj as Textbox;
    return {
      type: "text",
      page,
      x,
      y: pdfHeight - (top + (tb.fontSize || 16) * scaleY) / RENDER_SCALE,
      text: tb.text ?? "",
      size: ((tb.fontSize ?? 16) * scaleY) / RENDER_SCALE,
      color: String(tb.fill ?? "#000000"),
      font: (obj as Editable).spdfFont || "helvetica",
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
  // Fabric serializes read-only properties such as 'type'; never pass those
  // through the constructor/set API or runtime export will throw.
  const { type: _type, version: _version, ...options } = data;
  void _type;
  void _version;

  if (data.spdfType === "source") {
    if (typeof data.spdfSrc === "string") {
      const image = await FabricImage.fromURL(data.spdfSrc);
      image.set(options);
      return image;
    }
    if (data.type === "Textbox") return new Textbox(String(data.text ?? ""), options);
    return new Rect(options);
  }
  if (data.spdfType === "preview-mask") return new Rect(options);
  if (data.spdfType === "shape") {
    if (data.type === "Ellipse") return new Ellipse(options);
    if (data.type === "Line") return new Line([0, 0, Number(data.width ?? 100), Number(data.height ?? 1)], options);
    return new Rect(options);
  }
  if (data.spdfType === "draw") {
    const { Path } = await import("fabric");
    return new Path(data.path as string, options);
  }
  if (data.spdfType === "text") return new Textbox(String(data.text ?? ""), options);
  if (data.spdfType === "rect" || data.spdfType === "highlight") {
    const rect = new Rect(options);
    if (data.spdfType === "highlight") rect.setControlsVisibility({ mtr: false });
    return rect;
  }
  if (data.spdfType === "image" && typeof data.spdfSrc === "string") {
    const image = await FabricImage.fromURL(data.spdfSrc);
    image.set(options);
    return image;
  }
  return null;
}

/** Show a truthful preview when changing a native element. The backend performs
 * actual content-stream removal on export; this mask only improves the UI preview. */
function previewNativeChange(canvas: Canvas, object: Editable): Editable {
  if (object.spdfType !== "source" || !object.spdfOriginalRect) return object;
  if (!canvas.getObjects().some((item) => (item as Editable).spdfType === "preview-mask" &&
      (item as Editable).spdfId === object.spdfId)) {
    const [x0, y0, x1, y1] = object.spdfOriginalRect;
    const cover = new Rect({
      left: x0 * RENDER_SCALE, top: y0 * RENDER_SCALE,
      width: (x1 - x0) * RENDER_SCALE, height: (y1 - y0) * RENDER_SCALE,
      fill: "#ffffff", selectable: false, evented: false,
    }) as Editable;
    cover.spdfType = "preview-mask";
    cover.spdfId = object.spdfId;
    canvas.insertAt(0, cover);
  }
  if (object.spdfKind !== "text" || object instanceof Textbox) return object;
  const replacement = new Textbox(object.spdfText || "", {
    left: object.left, top: object.top,
    width: Math.max(200, object.getScaledWidth()),
    fontSize: (object.spdfSize || 12) * RENDER_SCALE,
    fill: object.spdfColor || "#000000",
    backgroundColor: "#ffffff",
    fontFamily: object.spdfFont === "times" ? "Times New Roman" :
      object.spdfFont === "courier" ? "Courier New" : "Arial",
  }) as Editable;
  Object.assign(replacement, {
    spdfType: "source", spdfKind: object.spdfKind,
    spdfId: object.spdfId, spdfOriginalRect: object.spdfOriginalRect,
    spdfText: object.spdfText, spdfSize: object.spdfSize,
    spdfColor: object.spdfColor, spdfFont: object.spdfFont,
    spdfBold: object.spdfBold, spdfItalic: object.spdfItalic,
    spdfChanged: true, spdfAction: object.spdfAction || "replace",
  });
  canvas.remove(object);
  canvas.add(replacement);
  canvas.setActiveObject(replacement);
  return replacement;
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
  const [drawingMode, setDrawingMode] = useState(false);
  const [selected, setSelected] = useState<Editable | null>(null);
  const [, setSelectionVersion] = useState(0);
  const [nativeWarning, setNativeWarning] = useState<string>();
  const historyRef = useRef<Map<number, string[]>>(new Map());
  const historyIndexRef = useRef<Map<number, number>>(new Map());
  const clipboardRef = useRef<Record<string, unknown> | null>(null);
  const pageLoadedRef = useRef<Set<number>>(new Set());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const loadingPageRef = useRef(0);
  const historyRestoringRef = useRef(false);

  function recordHistory() {
    if (historyRestoringRef.current) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const page = currentPageRef.current;
    const state = JSON.stringify(serialize(canvas));
    const items = historyRef.current.get(page) ?? [];
    const index = historyIndexRef.current.get(page) ?? -1;
    if (items[index] === state) return;
    const next = [...items.slice(0, index + 1), state].slice(-40);
    historyRef.current.set(page, next);
    historyIndexRef.current.set(page, next.length - 1);
  }
  async function stepHistory(direction: -1 | 1) {
    const page = currentPageRef.current;
    const list = historyRef.current.get(page) ?? [];
    const index = (historyIndexRef.current.get(page) ?? -1) + direction;
    if (index < 0 || index >= list.length || !fabricRef.current) return;
    historyRestoringRef.current = true;
    const canvas = fabricRef.current;
    const saved = JSON.parse(list[index]) as Record<string, unknown>[];
    canvas.discardActiveObject();
    canvas.remove(...canvas.getObjects());
    for (const item of saved) {
      const object = await loadObjectByType(item);
      if (object) canvas.add(object);
    }
    canvas.requestRenderAll();
    pageObjectsRef.current.set(page, saved);
    historyIndexRef.current.set(page, index);
    setSelected(null);
    historyRestoringRef.current = false;
  }
  function updateSelected(patch: Record<string, unknown>) {
    const canvas = fabricRef.current;
    if (!canvas || !selected) return;
    selected.set(patch);
    let updated = selected;
    if (selected.spdfType === "source") {
      selected.spdfChanged = true;
      selected.spdfAction = "replace";
      updated = previewNativeChange(canvas, selected);
      setSelected(updated);
    }
    updated.setCoords();
    canvas.requestRenderAll();
    setSelectionVersion((value) => value + 1);
    recordHistory();
  }

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
        serialize(canvas)
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

      if (!pageLoadedRef.current.has(pageIndex)) {
        try {
          const { elements } = await inspectPdfContent(file, pageIndex);
          if (request !== loadingPageRef.current || fabricRef.current !== canvas) return;
          for (const element of elements.slice(0, 600)) {
            const object = nativeObject(element);
            if (element.type === "image") {
              const [x0, y0, x1, y1] = element.rect;
              const clip = document.createElement("canvas");
              clip.width = Math.max(1, Math.round((x1 - x0) * RENDER_SCALE));
              clip.height = Math.max(1, Math.round((y1 - y0) * RENDER_SCALE));
              clip.getContext("2d")?.drawImage(rendered, x0 * RENDER_SCALE, y0 * RENDER_SCALE,
                clip.width, clip.height, 0, 0, clip.width, clip.height);
              const src = clip.toDataURL("image/png");
              const image = await FabricImage.fromURL(src);
              image.set({ left: object.left, top: object.top, scaleX: 1, scaleY: 1 });
              Object.assign(image, { spdfType: "source", spdfSrc: src, spdfId: object.spdfId,
                spdfKind: "image", spdfOriginalRect: element.rect, spdfChanged: false });
              canvas.add(image);
            } else {
              canvas.add(object);
            }
          }
          pageObjectsRef.current.set(pageIndex, serialize(canvas));
          pageLoadedRef.current.add(pageIndex);
          setNativeWarning(elements.length > 600
            ? "Only the first 600 existing elements can be selected on this page."
            : undefined);
        } catch (err) {
          setNativeWarning("Existing PDF content could not be inspected. Start the Python converter to edit existing text or images.");
          pageLoadedRef.current.add(pageIndex);
        }
      }
      const saved = pageObjectsRef.current.get(pageIndex) ?? [];
      canvas.remove(...canvas.getObjects());
      for (const data of saved) {
        const obj = await loadObjectByType(data);
        if (request !== loadingPageRef.current || fabricRef.current !== canvas) return;
        if (obj) canvas.add(obj);
      }

      canvas.requestRenderAll();
      currentPageRef.current = pageIndex;
      setCurrentPage(pageIndex);
      setSelected(null);
      if (!historyRef.current.has(pageIndex)) {
        historyRef.current.set(pageIndex, [JSON.stringify(serialize(canvas))]);
        historyIndexRef.current.set(pageIndex, 0);
      }
    },
    [file]
  );

  // A callback ref (not useEffect) so Fabric initializes exactly when the
  // <canvas> element mounts — it only exists in the DOM once a file is loaded,
  // so a mount-only effect would run too early and never see the element.
  const attachCanvas = useCallback((el: HTMLCanvasElement | null) => {
    if (el) {
      const canvas = new Canvas(el, { preserveObjectStacking: true });
      fabricRef.current = canvas;
      const selection = () => {
        setSelected(canvas.getActiveObject() as Editable | null);
        setSelectionVersion((value) => value + 1);
      };
      canvas.on("selection:created", selection);
      canvas.on("selection:updated", selection);
      canvas.on("selection:cleared", selection);
      canvas.on("object:modified", ({ target }) => {
        const object = target as Editable | undefined;
        if (object?.spdfType === "source") {
          object.spdfChanged = true;
          if (!object.spdfAction || object.spdfAction === "move") object.spdfAction = "move";
          previewNativeChange(canvas, object);
        }
        selection();
        recordHistory();
      });
      canvas.on("text:changed", ({ target }) => {
        const object = target as Editable | undefined;
        if (object?.spdfType === "source") {
          object.spdfChanged = true;
          object.spdfAction = "replace";
        }
        recordHistory();
      });
      canvas.on("path:created", ({ path }) => {
        (path as Editable).spdfType = "draw";
        recordHistory();
      });
      canvas.on("mouse:dblclick", ({ target }) => {
        const object = target as Editable | undefined;
        if (!object || object.spdfType !== "source" || object.spdfKind !== "text") return;
        object.spdfChanged = true;
        object.spdfAction = "replace";
        const visible = previewNativeChange(canvas, object);
        if (visible instanceof Textbox) visible.enterEditing();
        selection();
        canvas.requestRenderAll();
        recordHistory();
      });
    } else if (fabricRef.current) {
      fabricRef.current.dispose();
      fabricRef.current = null;
    }
  }, []);

  async function handleFile(f: File) {
    loadingPageRef.current++;
    pageObjectsRef.current = new Map();
    pageLoadedRef.current = new Set();
    historyRef.current = new Map();
    historyIndexRef.current = new Map();
    currentPageRef.current = 0;
    setSelected(null);
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
    recordHistory();
  }

  function addRect() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rect = new Rect({ left: 60, top: 60, width: 160, height: 40, fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1 });
    (rect as FabricObject & { spdfType?: string }).spdfType = "rect";
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    recordHistory();
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
    recordHistory();
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
    recordHistory();
  }

  function deleteSelected() {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    const object = active as Editable;
    if (object.spdfType === "source" && object.spdfOriginalRect) {
      object.spdfChanged = true;
      object.spdfAction = "delete";
      object.visible = false;
      object.selectable = false;
      const [x0, y0, x1, y1] = object.spdfOriginalRect;
      const mask = new Rect({
        left: x0 * RENDER_SCALE, top: y0 * RENDER_SCALE,
        width: (x1 - x0) * RENDER_SCALE, height: (y1 - y0) * RENDER_SCALE,
        fill: "#ffffff", selectable: false, evented: false,
      }) as Editable;
      mask.spdfType = "preview-mask";
      canvas.add(mask);
    } else {
      canvas.remove(object);
    }
    canvas.discardActiveObject();
    setSelected(null);
    canvas.requestRenderAll();
    recordHistory();
  }

  function addShape(kind: "ellipse" | "line") {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const shape = kind === "ellipse"
      ? new Ellipse({ left: 70, top: 80, rx: 80, ry: 45, fill: "rgba(0,0,0,0)", stroke: "#14b8a6", strokeWidth: 3 })
      : new Line([70, 70, 240, 73], { stroke: "#14b8a6", strokeWidth: 3 });
    (shape as Editable).spdfType = "shape";
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
    recordHistory();
  }

  function toggleDrawing() {
    setPanMode(false);
    setDrawingMode((enabled) => !enabled);
  }

  function copySelected(cut = false) {
    const object = fabricRef.current?.getActiveObject() as Editable | undefined;
    if (!object) return;
    if (object.spdfType === "source") {
      if (object.spdfKind === "text") {
        clipboardRef.current = {
          type: "Textbox", spdfType: "text", text: object instanceof Textbox ? object.text : object.spdfText,
          left: object.left, top: object.top, width: Math.max(120, object.getScaledWidth()),
          fontSize: (object.spdfSize || 12) * RENDER_SCALE,
          fill: object.spdfColor || "#000000",
        };
      } else if (object.spdfSrc) {
        clipboardRef.current = {
          type: "Image", spdfType: "image", spdfSrc: object.spdfSrc,
          left: object.left, top: object.top,
        };
      }
    } else {
      clipboardRef.current = object.toObject([...SERIALIZED_PROPS]) as Record<string, unknown>;
    }
    if (cut) deleteSelected();
  }

  async function pasteSelected() {
    const canvas = fabricRef.current;
    if (!canvas || !clipboardRef.current) return;
    const data = { ...clipboardRef.current, left: Number(clipboardRef.current.left ?? 60) + 24,
      top: Number(clipboardRef.current.top ?? 60) + 24 };
    clipboardRef.current = data;
    const object = await loadObjectByType(data);
    if (!object) return;
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    recordHistory();
  }

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (fabricRef.current?.getActiveObject() instanceof Textbox &&
          (fabricRef.current.getActiveObject() as Textbox).isEditing) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && ["c", "x", "v", "z", "y"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === "c") copySelected();
        if (event.key.toLowerCase() === "x") copySelected(true);
        if (event.key.toLowerCase() === "v") void pasteSelected();
        if (event.key.toLowerCase() === "z") void stepHistory(event.shiftKey ? 1 : -1);
        if (event.key.toLowerCase() === "y") void stepHistory(1);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (fabricRef.current?.getActiveObject()) { event.preventDefault(); deleteSelected(); }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = drawingMode && !panMode;
    if (canvas.isDrawingMode) {
      const brush = new PencilBrush(canvas);
      brush.color = "rgba(250,204,21,0.35)";
      brush.width = 18;
      canvas.freeDrawingBrush = brush;
    }
  }, [drawingMode, panMode, currentPage]);

  async function handleSave() {
    if (!file || !fabricRef.current) return;
    setStatus("loading");
    setMessage("Flattening your edits into the PDF…");
    try {
      const canvas = fabricRef.current;
      pageObjectsRef.current.set(
        currentPageRef.current,
        serialize(canvas)
      );

      const allObjects: EditObject[] = [];
      for (const [pageIndex, objs] of pageObjectsRef.current) {
        const size = pageSizes[pageIndex];
        if (!size) continue;
        for (const raw of objs) {
          if (raw.spdfType === "preview-mask") continue;
          const restored = await loadObjectByType(raw);
          if (!restored) continue;
          const converted = fabricObjectToEditObject(restored, pageIndex, size.height);
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
    canvas.skipTargetFind = panMode || drawingMode;
    canvas.forEachObject((obj) => {
      const editor = obj as Editable;
      const locked = editor.spdfType === "preview-mask" || editor.spdfAction === "delete";
      obj.selectable = !panMode && !drawingMode && !locked;
      obj.evented = !panMode && !drawingMode && !locked;
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [panMode, drawingMode, currentPage]);

  if (!file) {
    return (
      <div>
        <ToolHeader title="Edit PDF" description="Select existing PDF text or images, or add new annotations. Scanned text requires OCR." />
        <Card className="p-6">
          <Dropzone accept="application/pdf" onFiles={(files) => handleFile(files[0])} hint="Choose a PDF to start editing" />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ToolHeader title="Edit PDF" description="Edit existing text and images, draw, highlight and export. Advanced layouts and scanned text have limitations." />
        <Button onClick={handleSave} disabled={status === "loading"}>
          <Download className="h-4 w-4" /> Save & Download
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={addText}><Type className="h-4 w-4" /> Add text</Button>
        <Button variant="secondary" size="sm" onClick={addHighlight}><Highlighter className="h-4 w-4" /> Highlight</Button>
        <Button variant="secondary" size="sm" onClick={addRect}><Square className="h-4 w-4" /> Rectangle</Button>
        <Button variant="secondary" size="sm" onClick={() => addShape("ellipse")}><Circle className="h-4 w-4" /> Ellipse</Button>
        <Button variant="secondary" size="sm" onClick={() => addShape("line")}><Minus className="h-4 w-4" /> Line</Button>
        <Button variant="secondary" size="sm" onClick={toggleDrawing}><PenLine className="h-4 w-4" /> {drawingMode ? "Stop marking" : "Freehand marker"}</Button>
        <label>
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files && addImage(Array.from(e.target.files))} />
          <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-ink-50 hover:bg-ink-700">
            <ImagePlus className="h-4 w-4" /> Add image
          </span>
        </label>
        <Button variant="danger" size="sm" onClick={deleteSelected}><Trash2 className="h-4 w-4" /> Delete selected</Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="PDF viewport controls">
        <Button size="sm" variant="secondary" onClick={() => void stepHistory(-1)}><Undo2 className="h-4 w-4" /> Undo</Button>
        <Button size="sm" variant="secondary" onClick={() => void stepHistory(1)}><Redo2 className="h-4 w-4" /> Redo</Button>
        <Button size="sm" variant="secondary" onClick={() => setPanMode(false)}><MousePointer2 className="h-4 w-4" /> Select</Button>
        <Button size="sm" variant="secondary" onClick={() => setPanMode(true)}><Hand className="h-4 w-4" /> Pan {panMode ? "✓" : ""}</Button>
        <Button size="sm" variant="secondary" onClick={() => setZoom((v) => Math.max(0.2, +(v - 0.15).toFixed(2)))}><ZoomOut className="h-4 w-4" /> Zoom out</Button>
        <span className="min-w-14 text-center text-sm text-ink-300">{Math.round(zoom * RENDER_SCALE * 100)}%</span>
        <Button size="sm" variant="secondary" onClick={() => setZoom((v) => Math.min(2.5, +(v + 0.15).toFixed(2)))}><ZoomIn className="h-4 w-4" /> Zoom in</Button>
        <Button size="sm" variant="secondary" onClick={fitPage}><Maximize2 className="h-4 w-4" /> Fit page</Button>
      </div>

      {selected && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-ink-700 bg-ink-800/70 p-3">
          <div className="mr-2 text-xs font-semibold text-ink-200">
            {(selected as Editable).spdfType === "source" ? `Existing ${(selected as Editable).spdfKind} · ${(selected as Editable).spdfId}` : "Selected object"}
          </div>
          {(selected instanceof Textbox || ((selected as Editable).spdfType === "source" && (selected as Editable).spdfKind === "text")) && (
            <>
              <label className="flex min-w-[190px] flex-1 flex-col gap-1 text-xs text-ink-300">
                Text
                <input className="rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm text-ink-50"
                  value={selected instanceof Textbox ? selected.text : (selected as Editable).spdfText ?? ""}
                  onChange={(e) => updateSelected(selected instanceof Textbox
                    ? { text: e.target.value, spdfText: e.target.value }
                    : { spdfText: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-300">
                Font
                <select className="rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5"
                  value={(selected as Editable).spdfFont || "helvetica"}
                  onChange={(e) => updateSelected({
                    spdfFont: e.target.value,
                    ...(selected instanceof Textbox ? { fontFamily: e.target.value === "courier" ? "Courier New" : e.target.value === "times" ? "Times New Roman" : "Arial" } : {}),
                  })}>
                  <option value="helvetica">Helvetica</option>
                  <option value="times">Times</option>
                  <option value="courier">Courier</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-300">
                Size
                <input type="number" min="1" max="180"
                  className="w-20 rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
                  value={Math.round((selected as Editable).spdfSize || (selected instanceof Textbox ? (selected.fontSize || 18) / RENDER_SCALE : 12))}
                  onChange={(e) => {
                    const size = Math.max(1, Math.min(180, Number(e.target.value) || 12));
                    updateSelected({ spdfSize: size, ...(selected instanceof Textbox ? { fontSize: size * RENDER_SCALE } : {}) });
                  }} />
              </label>
              <button type="button" title="Bold" aria-label="Bold" aria-pressed={Boolean((selected as Editable).spdfBold)}
                className={cn("rounded-md border border-ink-600 p-2", (selected as Editable).spdfBold && "bg-brand-600")}
                onClick={() => updateSelected({ spdfBold: !(selected as Editable).spdfBold, ...(selected instanceof Textbox ? { fontWeight: !(selected as Editable).spdfBold ? "bold" : "normal" } : {}) })}>
                <Bold className="h-4 w-4" />
              </button>
              <button type="button" title="Italic" aria-label="Italic" aria-pressed={Boolean((selected as Editable).spdfItalic)}
                className={cn("rounded-md border border-ink-600 p-2", (selected as Editable).spdfItalic && "bg-brand-600")}
                onClick={() => updateSelected({ spdfItalic: !(selected as Editable).spdfItalic, ...(selected instanceof Textbox ? { fontStyle: !(selected as Editable).spdfItalic ? "italic" : "normal" } : {}) })}>
                <Italic className="h-4 w-4" />
              </button>
            </>
          )}
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            Color
            <input type="color" className="h-8 w-12 cursor-pointer rounded" value={
              (selected as Editable).spdfType === "source" ? (selected as Editable).spdfColor || "#000000" :
              typeof selected.fill === "string" && /^#[0-9a-f]{6}$/i.test(selected.fill) ? selected.fill : "#14b8a6"
            } onChange={(e) => updateSelected({
              ...((selected as Editable).spdfType === "source" ? { spdfColor: e.target.value } : { fill: e.target.value }),
              ...(selected instanceof Textbox ? { fill: e.target.value } : {}),
            })} />
          </label>
          <Button size="sm" variant="danger" onClick={deleteSelected}><Trash2 className="h-4 w-4" /> Delete</Button>
          <p className="w-full text-xs text-ink-400">Double-click existing text to edit it inline. Drag or resize the selection handles. Ctrl/Cmd+C, X, V and Z work when focus is outside a text field.</p>
        </div>
      )}

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

      {nativeWarning && <p role="status" className="mt-3 rounded-md border border-amber-500/40 p-2 text-sm text-amber-300">{nativeWarning}</p>}
      <p className="mt-2 text-xs text-ink-400">Page {currentPage + 1} of {pageCount}. Use Select to move added objects, Pan to move around the page, and Fit page to see the whole document. Scanned text is part of an image and cannot yet be edited directly.</p>

      <div className="mt-4">
        <StatusBanner state={status} message={message} />
      </div>
    </div>
  );
}
