import { useState } from "react";
import { Dropzone } from "../../components/Dropzone";
import { StatusBanner } from "../../components/StatusBanner";
import { ToolHeader, FieldLabel, inputClass } from "../../components/ToolHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { watermarkPdf } from "../../lib/api";
import { downloadBlob, extractErrorMessage } from "../../lib/utils";

export function Watermark() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(0.25);
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#94a3b8");
  const [position, setPosition] = useState<"center" | "tile">("center");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string>();

  async function handleSubmit() {
    if (!file || !text.trim()) return;
    setStatus("loading");
    setMessage("Applying watermark…");
    try {
      const blob = await watermarkPdf(file, { text, opacity, fontSize, color, position });
      downloadBlob(blob, `watermarked-${file.name}`);
      setStatus("success");
      setMessage("Done! Your download has started.");
    } catch (err) {
      setStatus("error");
      setMessage(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <ToolHeader title="Add a watermark" description="Stamp custom text across every page of your PDF." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          {!file ? (
            <Dropzone accept="application/pdf" onFiles={(files) => setFile(files[0])} hint="PDF files only" />
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
              <span className="truncate text-sm text-ink-100">{file.name}</span>
              <button className="text-sm text-ink-400 hover:text-ink-100" onClick={() => setFile(null)}>
                Remove
              </button>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>Watermark text</FieldLabel>
              <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Position</FieldLabel>
              <select
                className={inputClass}
                value={position}
                onChange={(e) => setPosition(e.target.value as "center" | "tile")}
              >
                <option value="center">Centered</option>
                <option value="tile">Tiled (repeat)</option>
              </select>
            </div>
            <div>
              <FieldLabel>Color</FieldLabel>
              <input
                type="color"
                className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800/80"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Font size ({fontSize}px)</FieldLabel>
              <input
                type="range"
                min={12}
                max={120}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
            <div>
              <FieldLabel>Opacity ({Math.round(opacity * 100)}%)</FieldLabel>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button disabled={!file || !text.trim() || status === "loading"} onClick={handleSubmit}>
              Apply watermark
            </Button>
          </div>
          <div className="mt-4">
            <StatusBanner state={status} message={message} />
          </div>
        </Card>

        <Card className="flex items-center justify-center p-6">
          <div
            className="relative flex aspect-[3/4] w-full max-w-[280px] items-center justify-center overflow-hidden rounded-lg border border-ink-700 bg-white text-slate-900"
          >
            <span
              className="select-none whitespace-nowrap font-bold"
              style={{
                fontSize: `${fontSize / 2.4}px`,
                color,
                opacity,
                transform: "rotate(-45deg)",
              }}
            >
              {text || "PREVIEW"}
            </span>
            <span className="absolute bottom-2 text-[10px] uppercase tracking-wide text-ink-400">Live preview</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
