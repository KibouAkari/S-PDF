import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { wordToPdf } from "../../lib/api";
import { downloadBlob, extractErrorMessage } from "../../lib/utils";

export function WordToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  async function handleSubmit() {
    if (!file) return;
    setStatus("loading");
    setMessage("Converting to PDF…");
    try {
      const blob = await wordToPdf(file);
      downloadBlob(blob, file.name.replace(/\.docx?$/i, "") + ".pdf");
      setStatus("success");
      setMessage("Done! Your PDF is downloading.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="Word to PDF" description="Turn Word documents into polished, portable PDFs." />
      <Card className="max-w-2xl p-6">
        {!file ? (
          <Dropzone
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onFiles={(files) => setFile(files[0])}
            hint="DOC or DOCX files"
          />
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
            <span className="truncate text-sm text-ink-100">{file.name}</span>
            <button className="text-sm text-ink-400 hover:text-ink-100" onClick={() => setFile(null)}>Remove</button>
          </div>
        )}
        <div className="mt-6">
          <Button disabled={!file || status === "loading"} onClick={handleSubmit}>Convert to PDF</Button>
        </div>
        <div className="mt-4">
          <StatusBanner state={status} message={message} />
        </div>
        <p className="mt-3 text-xs text-ink-400">Requires LibreOffice on the server for high-fidelity conversion.</p>
      </Card>
    </div>
  );
}
