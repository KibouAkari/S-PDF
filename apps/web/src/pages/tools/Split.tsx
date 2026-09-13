import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader, FieldLabel, inputClass } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { splitPdf } from "../../lib/api";
import { downloadBlob, extractErrorMessage } from "../../lib/utils";

export function Split() {
  const [file, setFile] = useState<File | null>(null);
  const [ranges, setRanges] = useState("1-1");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  async function handleSubmit() {
    if (!file || !ranges.trim()) return;
    setStatus("loading");
    setMessage("Splitting your PDF…");
    try {
      const blob = await splitPdf(file, ranges);
      downloadBlob(blob, file.name.replace(/\.pdf$/i, "") + "-split.zip");
      setStatus("success");
      setMessage("Done! A ZIP with your split PDFs is downloading.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="Split PDF" description="Extract one or more page ranges into separate PDF files." />
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
          <FieldLabel>Page ranges (comma-separated — one PDF per group)</FieldLabel>
          <input className={inputClass} value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder="e.g. 1-3, 4-4, 5-10" />
          <p className="mt-1.5 text-xs text-ink-400">Each comma-separated group becomes its own PDF in the downloaded ZIP.</p>
        </div>

        <div className="mt-6">
          <Button disabled={!file || !ranges.trim() || status === "loading"} onClick={handleSubmit}>Split PDF</Button>
        </div>
        <div className="mt-4">
          <StatusBanner state={status} message={message} />
        </div>
      </Card>
    </div>
  );
}
