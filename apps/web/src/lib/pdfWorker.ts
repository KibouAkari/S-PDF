import "./pdfCompat";
// Load PDF.js only after the compatibility shims have been installed.
await import("pdfjs-dist/build/pdf.worker.mjs");
