import { useCallback, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RotateCw, Trash2, Plus } from "lucide-react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { organizePdf, type OrganizePlanItem } from "../../lib/api";
import { renderPdfThumbnails } from "../../lib/pdfRender";
import { downloadBlob, extractErrorMessage, cn } from "../../lib/utils";

interface PageItem {
  id: string;
  fileIndex: number;
  pageIndex: number;
  rotation: 0 | 90 | 180 | 270;
  thumbnail: string;
  fileName: string;
}

function PageThumb({ page, onRotate, onDelete }: { page: PageItem; onRotate: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative cursor-grab select-none rounded-xl border border-ink-700 bg-ink-800/60 p-2 active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <div className="overflow-hidden rounded-lg border border-ink-700 bg-white">
        <img
          src={page.thumbnail}
          alt=""
          draggable={false}
          className="w-full"
          style={{ transform: `rotate(${page.rotation}deg)` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between px-0.5">
        <span className="truncate text-[11px] text-ink-400" title={page.fileName}>{page.fileName}</span>
      </div>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRotate(); }}
          className="rounded-md bg-ink-950/80 p-1.5 text-ink-100 hover:bg-brand-600"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="rounded-md bg-ink-950/80 p-1.5 text-ink-100 hover:bg-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Organize() {
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const addFiles = useCallback(
    async (newFiles: File[]) => {
      setStatus("loading");
      setMessage("Loading pages…");
      try {
        const startIndex = files.length;
        const nextFiles = [...files, ...newFiles];
        const newPageGroups = await Promise.all(
          newFiles.map((f) => renderPdfThumbnails(f))
        );
        const newPages: PageItem[] = [];
        newPageGroups.forEach((group, fi) => {
          group.forEach((thumb, pi) => {
            newPages.push({
              id: `${startIndex + fi}-${pi}-${crypto.randomUUID()}`,
              fileIndex: startIndex + fi,
              pageIndex: pi,
              rotation: 0,
              thumbnail: thumb.dataUrl,
              fileName: newFiles[fi].name,
            });
          });
        });
        setFiles(nextFiles);
        setPages((prev) => [...prev, ...newPages]);
        setStatus("idle");
        setMessage(undefined);
      } catch (err) {
        setStatus("error");
        setMessage(extractErrorMessage(err));
      }
    },
    [files]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPages((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function rotatePage(id: string) {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: ((p.rotation + 90) % 360) as PageItem["rotation"] } : p))
    );
  }

  function deletePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleMerge() {
    if (pages.length === 0) return;
    setStatus("loading");
    setMessage("Merging your document…");
    try {
      const plan: OrganizePlanItem[] = pages.map((p) => ({
        fileIndex: p.fileIndex,
        pageIndex: p.pageIndex,
        rotate: p.rotation,
      }));
      const blob = await organizePdf(files, plan);
      downloadBlob(blob, "organized.pdf");
      setStatus("success");
      setMessage("Done! Your merged PDF is downloading.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader
        title="Merge & Organize"
        description="Add one or more PDFs, drag pages into the order you want, rotate or remove any page, then export a single PDF."
      />

      {pages.length === 0 ? (
        <Card className="p-6">
          <Dropzone accept="application/pdf" multiple onFiles={addFiles} hint="Drop one or more PDFs to get started" />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-300">{pages.length} page{pages.length === 1 ? "" : "s"} from {files.length} file{files.length === 1 ? "" : "s"}</p>
            <div className="flex gap-2">
              <label>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
                />
                <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-ink-600 px-3 text-sm text-ink-200 hover:bg-ink-800">
                  <Plus className="h-4 w-4" /> Add more PDFs
                </span>
              </label>
              <Button onClick={handleMerge} disabled={status === "loading"}>
                Merge & Download
              </Button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {pages.map((page) => (
                  <PageThumb
                    key={page.id}
                    page={page}
                    onRotate={() => rotatePage(page.id)}
                    onDelete={() => deletePage(page.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <div className="mt-6">
        <StatusBanner state={status} message={message} />
      </div>
    </div>
  );
}
