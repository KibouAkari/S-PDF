import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { imagesToPdf } from "../../lib/api";
import { downloadBlob, extractErrorMessage } from "../../lib/utils";
import { X } from "lucide-react";

export function ImagesToPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  function addFiles(newFiles: File[]) {
    setFiles((prev) => [...prev, ...newFiles]);
  }

  async function handleSubmit() {
    if (files.length === 0) return;
    setStatus("loading");
    setMessage("Building your PDF…");
    try {
      const blob = await imagesToPdf(files);
      downloadBlob(blob, "images.pdf");
      setStatus("success");
      setMessage("Done! Your PDF is downloading.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="Images to PDF" description="Combine JPG, PNG or WEBP images into a single PDF, one page each." />
      <Card className="max-w-2xl p-6">
        <Dropzone accept="image/png,image/jpeg,image/webp" multiple onFiles={addFiles} hint="Add as many images as you like" />

        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2 text-sm">
                <span className="truncate text-ink-100">{i + 1}. {f.name}</span>
                <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-ink-400 hover:text-red-400">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <Button disabled={files.length === 0 || status === "loading"} onClick={handleSubmit}>
            Create PDF ({files.length} image{files.length === 1 ? "" : "s"})
          </Button>
        </div>
        <div className="mt-4">
          <StatusBanner state={status} message={message} />
        </div>
      </Card>
    </div>
  );
}
