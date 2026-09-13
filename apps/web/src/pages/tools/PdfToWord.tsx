import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { pdfToWord } from "../../lib/api";
import { downloadBlob, extractErrorMessage } from "../../lib/utils";

export function PdfToWord() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  async function handleSubmit() {
    if (!file) return;
    setStatus("loading");
    setMessage("Converting to Word — layout, text and images are preserved…");
    try {
      const blob = await pdfToWord(file);
      downloadBlob(blob, file.name.replace(/\.pdf$/i, "") + ".docx");
      setStatus("success");
      setMessage("Done! Your Word document is downloading.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="PDF to Word" description="Convert PDFs into fully editable Word (.docx) documents." />
      <Card className="max-w-2xl p-6">
        {!file ? (
          <Dropzone accept="application/pdf" onFiles={(files) => setFile(files[0])} hint="PDF files only" />
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
            <span className="truncate text-sm text-ink-100">{file.name}</span>
            <button className="text-sm text-ink-400 hover:text-ink-100" onClick={() => setFile(null)}>Remove</button>
          </div>
        )}
        <div className="mt-6">
          <Button disabled={!file || status === "loading"} onClick={handleSubmit}>Convert to Word</Button>
        </div>
        <div className="mt-4">
          <StatusBanner state={status} message={message} />
        </div>
      </Card>
    </div>
  );
}
