# S-PDF

A fast, self-hosted, open-source alternative to Adobe Acrobat / iLovePDF.
Merge, split, convert, watermark, compress and visually edit PDFs from a
clean, modern web UI — no subscriptions, no watermarked exports, no uploads
to a third party.

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React + TypeScript + Vite + Tailwind CSS v4, `pdf.js` (rendering), `fabric.js` (visual editor), `dnd-kit` (drag-to-reorder) |
| API       | Node.js + Express + TypeScript, `pdf-lib` for in-process PDF manipulation |
| Converter | Python + FastAPI, `pdf2docx` (PDF→Word), `PyMuPDF` (rasterization / compression), LibreOffice headless (Word→PDF) |

Everything runs locally / self-hosted. Uploaded files are held in memory only
for the duration of a request and are never written to disk or persisted.

## Features

- **Merge & Organize** — combine multiple PDFs, drag pages into any order, rotate or delete pages, export as one file.
- **Split** — extract page ranges into separate PDFs (returned as a ZIP).
- **Edit PDF** — add and freely move text, images and shapes on any page (fabric.js canvas over a `pdf.js`-rendered background), then flatten to a new PDF.
- **PDF ⇄ Word** — `pdf2docx` for PDF→Word; LibreOffice headless for Word→PDF.
- **PDF ⇄ Images** — rasterize pages to PNG at a chosen DPI, or build a PDF from a set of images.
- **Watermark** — centered or tiled text watermark with color/opacity/rotation controls.
- **Page numbers** — configurable position, start number and format string.
- **Compress** — re-encodes oversized embedded images and rebuilds the PDF object structure.

## Getting started (local dev)

Prerequisites: Node.js 20+, Python 3.11+, and (optionally) LibreOffice for Word→PDF.

```powershell
# 1. Install JS dependencies (root + both apps, via npm workspaces)
npm install --workspaces

# 2. Set up the Python converter service
npm run converter:install

# 3. Copy env defaults
Copy-Item apps/api/.env.example apps/api/.env

# 4. Run everything (API + web) in one terminal, converter in another
npm run converter:dev
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000
- Converter: http://localhost:8001

## Docker

```bash
docker compose up --build
```

Serves the web app on http://localhost:8080, proxying `/api` to the Node
service, which in turn talks to the Python converter service. The converter
image bundles LibreOffice so Word→PDF works out of the box in Docker.

## Project layout

```
apps/
  web/      React frontend (Vite)
  api/      Express API — organize/watermark/page-numbers/compress orchestration via pdf-lib
services/
  converter/  FastAPI microservice — pdf2docx / PyMuPDF / LibreOffice
```

## Notes & limitations

- Word→PDF requires LibreOffice (`soffice`) installed on the machine running
  the converter service (bundled automatically in the Docker image).
- The visual editor adds/moves new content and can redact/whiteout existing
  content with a filled rectangle; PDFs don't have reflowable text, so true
  in-place editing of pre-existing text works the same way professional PDF
  editors do it — cover + re-draw.
