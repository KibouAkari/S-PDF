import { useCallback, useRef, useState, type ReactNode } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "../lib/utils";

interface DropzoneProps {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
  hint?: string;
  icon?: ReactNode;
}

export function Dropzone({ accept, multiple = false, onFiles, label, hint, icon }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      onFiles(Array.from(fileList));
    },
    [onFiles]
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer",
        dragging ? "border-brand-400 bg-brand-500/10" : "border-ink-600 hover:border-ink-400 hover:bg-ink-800/40"
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {icon ?? <UploadCloud className="h-10 w-10 text-brand-400" strokeWidth={1.5} />}
      <div>
        <p className="font-medium text-ink-50">{label ?? "Drop files here, or click to browse"}</p>
        {hint && <p className="mt-1 text-sm text-ink-300">{hint}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
