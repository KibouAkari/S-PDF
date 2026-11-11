# S-PDF on Vercel: deployment and acceptance checklist

This document describes the intended deployment configuration in this repository.
It is not evidence that a specific production deployment has passed testing.

## Architecture

Use **one Vercel project** with Framework Preset **Services**, linked to the
repository root. The root `vercel.json` deploys two services behind one domain:

| Service | Source | Runtime | Function |
| --- | --- | --- | --- |
| `web` | `apps/web` | Vite static | Existing React interface |
| `converter` | `services/converter` | Container (`Dockerfile.vercel`) | FastAPI, PyMuPDF, pdf2docx, LibreOffice Writer |

The converter uses the Container runtime because the standard Python runtime
does not provide the `soffice` binary. The image installs LibreOffice Writer
and fonts. Keep `/api/*` routed to `converter`. This has no effect on CSS,
navigation, URLs, or existing browser tool layouts.

Vercel's Container runtime and Services support are in beta; validate the
project's plan, runtime availability, function memory, CPU, timeout, image build
size, and billing before sending production traffic.

References:

- [Vercel Services](https://vercel.com/kb/guide/vercel-services)
- [Container runtime / multiple services](https://vercel.com/kb/guide/docker)
- [Vercel container announcement](https://vercel.com/changelog/deploy-a-container-from-a-plain-dockerfile)

## Migration from two existing Vercel projects

The names `s-pdf` and `s-pdf-api` alone do **not** show whether a project
is redundant. Before changing or deleting either one:

1. Check which project owns `simi-pdf.vercel.app` under **Domains**.
2. Inspect the Git repository, branch, Root Directory and Framework preset
   of both projects.
3. Check whether any frontend rewrites, environment variables, integrations,
   and other domains refer to `s-pdf-api`.
4. Deploy a **preview** of the single-Services project, not directly to
   production. Compare all 11 advertised tools.
5. Move the existing production domain only after a successful smoke test and
   prepare a rollback to the current deployment.
6. Do not delete the old project until no consumers, links, or integrations
   depend on it. Do not delete anything as part of this migration automatically.

## Local validation

Run these commands from the repository root:

```bash
npm ci
npm run build
python -m pip install -r services/converter/requirements-test.txt
PYTHONPATH=services/converter python -m unittest discover -s services/converter/tests -v
docker build -f services/converter/Dockerfile.vercel -t s-pdf-converter:verify services/converter
docker run --rm -p 127.0.0.1:18081:80 s-pdf-converter:verify
```

In a second terminal, check readiness and DOCX conversion:

```bash
curl -fsS http://127.0.0.1:18081/api/health
# Expected: libreoffice=true and wordToPdf=available
curl -fSs -F 'file=@test.docx' http://127.0.0.1:18081/api/convert/word-to-pdf -o test.pdf
file test.pdf
```

Use a harmless, nonconfidential `test.docx`. Open the generated PDF and verify
all pages, text, fonts, images, links and page layout before declaring success.
The health endpoint proves only that the executable exists, not that conversion
or output fidelity succeeded.

## Browser acceptance matrix

Test each item on the **actual preview deployment**, with both small and
representative larger files. Do not upload private or customer documents to a
preview whose privacy controls have not been reviewed.

| Tool | Critical test |
| --- | --- |
| Merge & Organize | Merge two PDFs, reorder, remove, rotate, verify exported page order |
| Split PDF | Export two page ranges and inspect each ZIP member |
| Edit PDF | Add text/image/shape; edit existing text; re-open output; visual fidelity |
| PDF to Word | Convert PDF; open resulting DOCX in Word/LibreOffice |
| Word to PDF | Convert DOC and DOCX; inspect PDF and page layout |
| PDF to Images | Export 96/150/300 DPI; inspect every ZIP PNG |
| Images to PDF | Upload PNG, JPEG and WEBP; verify dimensions, transparency and order |
| Watermark | Center and tile on portrait/landscape pages |
| Page Numbers | Positions, start value and `{n}`/`{total}` format |
| Compress | Small and photo-heavy PDFs; ensure valid output and no file-size increase |
| Rotate Pages | Rotate selected pages and verify saved rotations |

Also verify missing/empty files, malformed PDFs, oversized uploads, double
clicks, browser downloads and network failures. Editor native element
modification remains **experimental**, not lossless; consult `docs/EDITOR.md`.

## Production checks

1. Compare the preview's `GET /api/health` with production. It must report
   `libreoffice: true` on the converter service.
2. Confirm a harmless DOCX can be converted and that the resulting bytes begin
   with `%PDF-`; opening it in multiple viewers is the definitive check.
3. Inspect Vercel build logs and runtime errors for both `web` and `converter`.
4. Use realistic documents to validate latency, memory use, timeout and
   behavior during simultaneous uploads.
5. Configure rate controls and a total request-size cap in Vercel/edge
   infrastructure. Application upload checks do not replace edge enforcement.
6. Keep the previous production deployment available for rollback, and monitor
   errors after cutover.

## Security and remaining limitations

- All uploads are untrusted. Do not assume document conversion is a sandbox.
  The conversion process runs as a non-root user and with a per-request
  LibreOffice profile, but further runtime isolation and file-parsing review
  are still recommended.
- Uploaded PDFs may contain sensitive data. The service temporarily stores
  Word and converted files, and cleans up those temporary directories.
- Scanned PDF to editable Word needs OCR, which S-PDF does not provide.
- Complex PDFs may lose exact layout during PDF to Word, and Office fonts
  absent from the runtime may be substituted.
- Vercel function limits and finite memory still apply; benchmark large files.
- `docs/LICENSING.md` explains important PyMuPDF licensing obligations.
