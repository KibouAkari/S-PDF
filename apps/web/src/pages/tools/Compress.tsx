import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { compressPdf } from "../../lib/api";
import { downloadBlob, extractErrorMessage, formatBytes } from "../../lib/utils";
import { cn } from "../../lib/utils";

const LEVELS = [
  { id: "low", title: "Low", desc: "Best quality, smallest reduction" },
  { id: "medium", title: "Medium", desc: "Balanced (recommended)" },
  { id: "high", title: "High", desc: "Smallest file, lower image quality" },
] as const;

export function Compress() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<"low" | "medium" | "high">("medium");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();
  const [resultSize, setResultSize] = useState<number | null>(null);

  async function handleSubmit() {
    if (!file) return;
    setStatus("loading");
    setResultSize(null);
    setMessage("Compressing… this can take a moment for image-heavy PDFs.");
    try {
      const blob = await compressPdf(file, level);
      downloadBlob(blob, `compressed-${file.name}`);
      setResultSize(blob.size);
      setStatus("success");
      setMessage(`Done! ${formatBytes(file.size)} → ${formatBytes(blob.size)}`);
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="Compress PDF" description="Shrink file size by re-encoding embedded images." />
      <Card className="max-w-2xl p-6">
        {!file ? (
          <Dropzone accept="application/pdf" onFiles={(files) => setFile(files[0])} hint="PDF files only" />
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
            <span className="truncate text-sm text-ink-100">{file.name} · {formatBytes(file.size)}</span>
            <button className="text-sm text-ink-400 hover:text-ink-100" onClick={() => { setFile(null); setResultSize(null); }}>Remove</button>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLevel(l.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                level === l.id ? "border-brand-400 bg-brand-500/10" : "border-ink-700 hover:border-ink-500"
              )}
            >
              <div className="font-medium text-ink-50">{l.title}</div>
              <div className="mt-1 text-xs text-ink-300">{l.desc}</div>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <Button disabled={!file || status === "loading"} onClick={handleSubmit}>Compress PDF</Button>
        </div>
        <div className="mt-4">
          <StatusBanner state={status} message={message} />
        </div>
        {resultSize !== null && file && (
          <p className="mt-2 text-xs text-ink-400">
            Reduced by {Math.max(0, Math.round((1 - resultSize / file.size) * 100))}%
          </p>
        )}
      </Card>
    </div>
  );
}
