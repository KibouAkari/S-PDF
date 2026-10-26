import "./pdfCompat";
// Load PDF.js only after the compatibility shims have been installed.
// PDF.js does not ship TypeScript declarations for the standalone worker entry.
// @ts-expect-error worker entry module has no declaration file
await import("pdfjs-dist/build/pdf.worker.mjs");
