import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader, FieldLabel, inputClass } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { pageNumbersPdf } from "../../lib/api";
import { downloadBlob, extractErrorMessage } from "../../lib/utils";

const POSITIONS = [
  "bottom-center", "bottom-left", "bottom-right",
  "top-center", "top-left", "top-right",
];

export function PageNumbers() {
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState("bottom-center");
  const [startAt, setStartAt] = useState(1);
  const [format, setFormat] = useState("{n}");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  async function handleSubmit() {
    if (!file) return;
    setStatus("loading");
    setMessage("Adding page numbers…");
    try {
      const blob = await pageNumbersPdf(file, { position, startAt, format });
      downloadBlob(blob, `numbered-${file.name}`);
      setStatus("success");
      setMessage("Done! Your download has started.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="Add page numbers" description="Number every page with full control over position and format." />
      <Card className="max-w-2xl p-6">
        {!file ? (
          <Dropzone accept="application/pdf" onFiles={(files) => setFile(files[0])} hint="PDF files only" />
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
            <span className="truncate text-sm text-ink-100">{file.name}</span>
            <button className="text-sm text-ink-400 hover:text-ink-100" onClick={() => setFile(null)}>Remove</button>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Position</FieldLabel>
            <select className={inputClass} value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p.replace("-", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Start at</FieldLabel>
            <input type="number" min={0} className={inputClass} value={startAt} onChange={(e) => setStartAt(Number(e.target.value))} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Format (use {"{n}"} and {"{total}"})</FieldLabel>
            <input className={inputClass} value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Page {n} of {total}" />
          </div>
        </div>

        <div className="mt-6">
          <Button disabled={!file || status === "loading"} onClick={handleSubmit}>Add page numbers</Button>
        </div>
        <div className="mt-4">
          <StatusBanner state={status} message={message} />
        </div>
      </Card>
    </div>
  );
}
