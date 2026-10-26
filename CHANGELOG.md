# Changelog

All notable changes to this project are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
