# Validation and testing

## Automated checks

The GitHub Actions CI workflow performs:

- Node and web TypeScript builds.
- Python converter imports.
- Native editing tests with generated PDFs. They verify that text is discovered, replaced, moved, and removed from PDF extraction; source IDs are validated; embedded images can be discovered.

Run the native tests locally:

```bash
PYTHONPATH=services/converter python -m unittest discover -s services/converter/tests -v
```

Run frontend/backend checks:

```bash
npm install --workspaces
npm run build -w apps/api
npm run build -w apps/web
```

## Browser acceptance checklist

Before merging a major editor update, test in Chromium and Firefox with the Python converter connected:

- Native text selection, inline editing, changing font/size/color, dragging and resize.
- Native image selection, moving, resizing and exporting.
- Multiple pages, page switching and retained modifications.
- Fit page, mouse pan, scroll and zoom without selection offsets.
- Add text, transparent highlights, rectangles, ellipses, lines, image overlays and freehand strokes.
- Delete, copy, cut, paste and undo/redo after changing page content.
- Verify saved outputs by reopening them and comparing with the original.
- Test regular text PDFs, scanned PDFs, rotated pages, complex fonts and vector-heavy documents.
- Verify error messages for invalid PDFs, fonts that cannot encode content and text that does not fit.

**Important:** Automated build/unit tests do not prove browser interaction correctness or PDF visual fidelity. If these tests are not executed, do not call the editor production-ready.

## Security checks before deployment

Reject excessive uploads by measured bytes, isolate converter processes, cap computation time, scan dependencies, and check for image/XML/archive decompression abuse. Full production hardening is an open task.
