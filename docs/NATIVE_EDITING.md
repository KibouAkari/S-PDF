# Editing existing PDF content

## Current implementation

S-PDF can inspect selectable **native text spans** and **embedded raster image blocks** using PyMuPDF. On a page, click an existing element to select it, drag the selection to reposition it, and use the resize handles. Double-click a native text selection to turn it into an editable text box. The properties bar changes text, family, size, weight, italic style and color.

When exporting, a changed source element is removed using PDF redaction and then reconstructed at its target location. This is a **real change to the exported PDF**, not simply an opaque white rectangle over existing text. Native deletion removes content from text extraction for standard text-based PDFs.

## How to use

1. Open **Edit PDF**, upload a PDF and wait for page inspection.
2. Select a native text or image area. Use **Pan** to scroll without moving selected content.
3. For text, double-click to edit inline, or change its text in the selection properties.
4. Drag to move, drag handles to resize, or press **Delete** to remove the source item.
5. Use **Add text**, **Rectangle**, **Ellipse**, **Line**, **Add image** or **Freehand marker** for new annotations.
6. Use **Ctrl/Cmd+C/X/V** for editor elements, and **Ctrl/Cmd+Z** or the history buttons to undo on the current page.
7. Use **Save & Download**. Inspect the resulting PDF in an independent viewer.

## Important fidelity limits

PDF is a final-format document, not a Word document. Text is often split into spans, sometimes individual glyphs, and original fonts may not be distributable or reconstructible. The current native engine reflows selected text with a limited set of built-in PDF fonts: Helvetica, Times and Courier. Text that does not fit a selected box produces an error rather than silently disappearing.

Redaction of a text span can remove other touching glyphs. Deleting an image can also affect overlapping content. Images with special transparency, clipping masks, or repeated references may not reproduce pixel-for-pixel after an edit. PDFs with rotations, nested transformations, form XObjects and unusual crop boxes need additional regression fixtures. Not all vector shapes are selectable as source objects: **existing vector graphics are not yet editable**.

**Scans:** a page photographed or scanned as one image is selectable as an image, but the letters inside are pixels. OCR plus layout reconstruction is planned and is not available in this version.

**Undo:** history is maintained per currently loaded page. Undo is not yet a transactional history over the whole document; closing the editor discards unsaved changes.

**Redaction:** source edits use redaction to remove affected content from the content stream; however, S-PDF does not yet offer a verified end-to-end privacy redaction workflow. Do not use it to remove sensitive information without independent verification.

## Backend requirements

The Python converter must be running for **native content inspection and modifications** in local/Docker deployments. The Node API forwards native source edits to the converter. New overlay annotations can still be exported with the Node PDF API. On a Python-only deployment, both capabilities are handled by the converter.

## What the editor is not yet

S-PDF does not currently provide lossless Acrobat-style rewriting of arbitrary vector drawings, fonts, complex page content, OCR text, PDF form fields or structured tables. These are roadmap items, **not supported feature claims**.
