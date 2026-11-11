# Changelog

All notable changes to this project are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Added a LibreOffice-equipped Vercel container deployment option for Word to PDF; the previous Python serverless route returned HTTP 503 when `soffice` was absent.
- Isolated LibreOffice profiles per request, moved its blocking subprocess off the FastAPI event loop, and made conversion failures easier to understand.
- Fixed PDF compression image replacement to update PDF image dictionaries correctly and avoid returning larger files.
- Added WEBP decoding for Images to PDF while preserving PNG/JPEG source streams and transparency.
- Enforced measured upload-size limits in converter routes, including multipart requests without `Content-Length`.
- Display FastAPI validation and service-error details in the existing frontend status banner.

### Test coverage

- Added HTTP regression checks for standard PDF tools and conversion failures, with real Office conversion exercised when LibreOffice is available.
- Added [Vercel deployment and acceptance checklist](docs/DEPLOY_VERCEL.md). The production website remains unverified until a preview and deployment logs can be inspected.

### Changed

- Native PDF editing prototype for existing text spans and embedded images now removes and reconstructs selected source objects during export, rather than only overlaying new content.
- The editor adds selection, size/font/color controls, basic native line/rectangle editing, freehand markers, keyboard commands and per-page undo/redo.
- Browser compatibility shims allow PDF.js rendering in Chromium versions without Map upsert methods.
- Python engine updated for reliable removal of basic vector paths; regression tests cover the behavior.
- Product documentation now distinguishes experimental native editing from supported conversion tools and explains AGPL/commercial obligations for PyMuPDF.

### Validation

- CI builds web/API, imports the converter and executes Python unit and multipart HTTP tests.
- A Chromium browser smoke test edits original text, downloads the PDF and reopens the resulting document to verify changed content.
- Real-world PDF fidelity, full OCR and complex drawing editing remain unverified and experimental.

### Added

- Initial release: merge/organize, split, watermark, page numbers, compress,
  PDF↔Word, PDF↔Images, Images→PDF, and a visual page editor.
- Python (`services/converter`) implementations of every PDF operation so the
  app can run as a two-service deployment (web + converter) on Vercel.
- Docker Compose setup for self-hosting all three services.
