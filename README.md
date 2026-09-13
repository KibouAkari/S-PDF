<div align="center">
  <img src="apps/web/public/favicon.svg" alt="S-PDF logo" width="72" height="72" />

  # S-PDF

  **Merge, convert, edit, and clean up your PDFs - fast, free, and self-hosted.**

  [![CI](https://github.com/kibouakari/S-PDF/actions/workflows/ci.yml/badge.svg)](https://github.com/kibouakari/S-PDF/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
</div>

A fast, self-hosted, open-source alternative to Adobe Acrobat / iLovePDF.
Merge, split, convert, watermark, compress and visually edit PDFs from a
clean, modern web UI - no subscriptions, no watermarked exports, no uploads
to a third party.

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React + TypeScript + Vite + Tailwind CSS v4, `pdf.js` (rendering), `fabric.js` (visual editor), `dnd-kit` (drag-to-reorder) |
| API       | Node.js + Express + TypeScript, `pdf-lib` for in-process PDF manipulation (used for local dev / Docker) |
| Converter | Python + FastAPI, `PyMuPDF` (page ops, rasterization, compression), `pdf2docx` (PDF→Word), LibreOffice headless (Word→PDF) |

Every PDF operation is implemented **twice**: once in Node (`apps/api`, via
`pdf-lib`) for local development and Docker deployments, and once in Python
(`services/converter`, via `PyMuPDF`) so the app can also run as a two-service
(`web` + `converter`) deployment on platforms like Vercel that don't run a
long-lived Node API. See [CONTRIBUTING.md](CONTRIBUTING.md) for what that
means when you change a PDF endpoint.

Everything runs locally / self-hosted. Uploaded files are held in memory only
for the duration of a request and are never written to disk or persisted.

## Features

- **Merge & Organize** - combine multiple PDFs, drag pages into any order, rotate or delete pages, export as one file.
- **Split** - extract page ranges into separate PDFs (returned as a ZIP).
- **Edit PDF** - add and freely move text, images and shapes on any page (fabric.js canvas over a `pdf.js`-rendered background), then flatten to a new PDF.
- **PDF ⇄ Word** - `pdf2docx` for PDF→Word; LibreOffice headless for Word→PDF.
- **PDF ⇄ Images** - rasterize pages to PNG at a chosen DPI, or build a PDF from a set of images.
- **Watermark** - centered or tiled text watermark with color/opacity/rotation controls.
- **Page numbers** - configurable position, start number and format string.
- **Compress** - re-encodes oversized embedded images and rebuilds the PDF object structure.

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

## Deploying to Vercel

This repo includes a root [`vercel.json`](vercel.json) that defines two
services and routes all `/api/*` traffic straight to the Python converter
service (there is no Node API in this deployment path):

```json
{
  "services": {
    "web": { "root": "apps/web", "framework": "vite" },
    "converter": { "root": "services/converter", "entrypoint": "main:app" }
  },
  "rewrites": [
    { "source": "/api(/.*)?", "destination": { "type": "service", "service": "converter" } },
    { "source": "/(.*)", "destination": { "type": "service", "service": "web" } }
  ]
}
```

- This uses Vercel's [Services](https://vercel.com/docs/services) feature
  (not classic zero-config Functions), so the Python service needs an explicit
  `entrypoint: "main:app"` pointing at the FastAPI `app` object in
  `services/converter/main.py` - there's no `api/` folder involved.
- Import the repo into Vercel as a single project; it will pick up both
  services from `vercel.json` automatically.
- **Known limitation:** Word→PDF needs LibreOffice, which isn't available in
  Vercel's serverless Python runtime - that endpoint will return a clear 503
  there. It works fully in Docker/self-hosted deployments (see below).
- **Known risk:** `pdf2docx` pulls in `opencv-python-headless` + `numpy`,
  which can push the function bundle close to Vercel's size limits. If a
  deploy fails on size, that's the first place to look.

## Project layout

```
apps/
  web/      React frontend (Vite)
  api/      Express API - pdf-lib based; used for local dev & Docker
services/
  converter/  FastAPI microservice - full PDF API (PyMuPDF) + pdf2docx / LibreOffice conversions
    main.py     entrypoint referenced by vercel.json as "main:app"
```

## Notes & limitations

- Word→PDF requires LibreOffice (`soffice`) installed on the machine running
  the converter service (bundled automatically in the Docker image; not
  available on Vercel).
- The visual editor adds/moves new content and can redact/whiteout existing
  content with a filled rectangle; PDFs don't have reflowable text, so true
  in-place editing of pre-existing text works the same way professional PDF
  editors do it - cover + re-draw.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for
local setup, coding conventions, and what to check before opening a PR. This
project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? Please see [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## License

[MIT](LICENSE) - do whatever you like with it, attribution appreciated.
