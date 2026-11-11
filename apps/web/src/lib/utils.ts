import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Triggers a browser download for a Blob, then revokes the object URL. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as {
      response?: { status?: number; data?: { error?: string; detail?: string | { msg?: string }[] } };
    }).response;
    const data = response?.data;
    if (typeof data?.error === "string" && data.error) return data.error;
    if (typeof data?.detail === "string" && data.detail) return data.detail;
    if (Array.isArray(data?.detail) && data.detail.length) {
      return data.detail.map((issue) => issue.msg).filter(Boolean).join("; ") || "Invalid input.";
    }
    if (response?.status === 413) return "This file is too large for the server.";
    if (response?.status === 503) return "The conversion service is unavailable. Please try again later.";
    if (response?.status === 504) return "Conversion timed out. Try a smaller document.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
