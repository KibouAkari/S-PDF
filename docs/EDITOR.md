# PDF editor: capabilities and architecture

## Status

The editor supports **page overlays and experimental native content editing**. Users can add movable text, images, rectangles, and transparent highlights, then export a flattened PDF. Objects added by S-PDF can be moved or deleted before export.

**Native text spans, embedded image blocks and basic rectangular/line drawing paths can now be selected, moved, resized and exported with replacement/removal using the Python converter. Complex vector graphics, OCR text in scanned pages, PDF forms and lossless layout reconstruction remain unsupported.** A white rectangle is a visible overlay, **not secure redaction**. This distinction matters when handling confidential documents.

## How it works

1. `pdf.js` renders each original page into a dedicated page bitmap displayed underneath the editor. **The PDF page is never a Fabric background or an editable object.**
2. Fabric.js renders a transparent editing layer above that bitmap, used for selection targets and new elements. A failure to extract native objects does not erase the visible PDF.
3. The editor converts overlay positions to PDF coordinates. Native source edits use PyMuPDF's top-left page coordinates.
4. `POST /api/pdf/edit` applies the overlays to the original PDF using either pdf-lib (Node API) or PyMuPDF (Python converter).
5. The returned PDF is downloaded. Native source spans, image blocks and simple line/rectangle paths are imported as select targets. Source changes are forwarded to the Python backend for redaction and reconstruction.

The Node and Python endpoints share a request contract but use different PDF engines. **Native source editing is only implemented in Python; the Node API forwards such requests to the converter.** Validate deployment parity when adding an overlay operation.

## Editing controls

The compact toolbar offers **Select**, **Text**, **Highlight**, **Draw**, **Shapes** and **Image**. Shapes is a dropdown for rectangles, ellipses and lines. **Pan** is separate from editing mode. Undo/redo, delete and zoom are in a small navigation bar. Font, size, weight, style and color appear only after selecting a compatible object. Double-click a native text span to edit it and use Save & Download to export the modified PDF.

## Known limitations

- Simple existing text spans and raster images are editable experimentally. Complex vector graphics and original document fonts are not.
- Overlays are flattened on export and cannot be reopened as individually editable S-PDF objects.
- Text export does not preserve the source document's font family, kerning or typography.
- Rotated source pages, nonstandard crop boxes, multi-line layout and some Unicode fonts may require additional coordinate/font handling.
- Large documents currently render a thumbnail for every page, which can consume significant browser memory.
- Per-page undo/redo and keyboard object operations are available; autosave and cross-page transaction history are not.
- A rectangle that visually hides text does not erase the text from the PDF content stream.

## Roadmap for more complete Acrobat-style editing

### 1. Extract and identify source content

Extract text spans, glyph bounding boxes, font metadata, images and page transforms from the **original PDF**. Expose this as a structured, immutable content model. Do not silently treat an image of a scanned page as text; offer OCR as a separate opt-in step.

### 2. Implement destructive modifications safely

Provide explicit operations for replacing text, moving source text/images, deleting content, and secure redaction. Use a backend PDF engine capable of modifying/removing existing page content. PyMuPDF redactions can remove underlying text and then insert replacement text, but may change fonts or nearby content. Avoid claiming lossless editing where reconstruction is necessary.

### 3. Design editing interactions

Offer Select, Edit Text, Add Text, Move, Image, Highlight and Redact modes. Use selection bounding boxes, clear handles, inline text editing, a properties inspector, keyboard shortcuts, undo/redo and zoom controls. Preserve the page coordinate transform across zoom, page rotation and responsive layouts.

### 4. Verify exported PDFs

Test edited text searchability, appearance, rotation, object persistence, multi-page edits, annotations, embedded images and font fallback. Include before/after visual regressions. For genuine redaction, ensure removed strings are not retrievable from the final PDF, not merely covered visually.

## Acceptance criteria for a full editor

- Clicking an existing text span selects it; editing it changes the saved PDF without leaving the original text beneath it.
- Existing image objects can be selected and moved without leaving a duplicate behind.
- Highlights remain transparent in both deployment modes.
- Redaction permanently removes the target content, including from text extraction.
- Undo/redo works across pages; export reflects the final history state.
- Save/open/export is tested using native, scanned, rotated and multipage PDFs.
- The UI explains when fidelity cannot be preserved.

These are **future acceptance criteria**, not claims about current functionality.


See [Native Editing](NATIVE_EDITING.md) for the currently implemented scope and fidelity caveats.
