import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader, FieldLabel, inputClass } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { pdfToImages } from "../../lib/api";
import { downloadBlob, extractErrorMessage } from "../../lib/utils";

export function PdfToImages() {
  const [file, setFile] = useState<File | null>(null);
  const [dpi, setDpi] = useState(150);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  async function handleSubmit() {
    if (!file) return;
    setStatus("loading");
    setMessage("Rendering pages to images…");
    try {
      const blob = await pdfToImages(file, dpi);
      downloadBlob(blob, file.name.replace(/\.pdf$/i, "") + "-pages.zip");
      setStatus("success");
      setMessage("Done! A ZIP of PNG pages is downloading.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="PDF to Images" description="Export every page as a high-resolution PNG image." />
      <Card className="max-w-2xl p-6">
        {!file ? (
          <Dropzone accept="application/pdf" onFiles={(files) => setFile(files[0])} hint="PDF files only" />
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
            <span className="truncate text-sm text-ink-100">{file.name}</span>
            <button className="text-sm text-ink-400 hover:text-ink-100" onClick={() => setFile(null)}>Remove</button>
          </div>
        )}
        <div className="mt-6 max-w-xs">
          <FieldLabel>Resolution (DPI)</FieldLabel>
          <select className={inputClass} value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            <option value={96}>96 — Web</option>
            <option value={150}>150 — Standard</option>
            <option value={300}>300 — Print</option>
            <option value={600}>600 — High-res</option>
          </select>
        </div>
        <div className="mt-6">
          <Button disabled={!file || status === "loading"} onClick={handleSubmit}>Export as images</Button>
        </div>
        <div className="mt-4">
          <StatusBanner state={status} message={message} />
        </div>
      </Card>
    </div>
  );
}
