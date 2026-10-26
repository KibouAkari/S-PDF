# S-PDF architecture

## Services

| Component | Location | Responsibility |
| --- | --- | --- |
| Web | `apps/web` | React/Vite application, pdf.js previews, Fabric.js overlay editor |
| Node API | `apps/api` | Express and pdf-lib PDF operations, used in local/Docker deployments |
| Python converter | `services/converter` | FastAPI, PyMuPDF, pdf2docx, optional LibreOffice conversions |

In local/Docker deployments the Node API routes requests and may call the converter. The documented Vercel deployment instead routes PDF endpoints directly to the Python service. Consequently, **there are two implementations of multiple PDF endpoints**.

## Consistency obligations

Changes to `/api/pdf/edit`, `/api/pdf/organize`, `/api/pdf/split` and other duplicated operations need contract tests against both backends. A passing frontend build does not prove endpoint parity.

Check: request fields and response types, page coordinates and rotation, invalid inputs, image transparency, errors and output fidelity.

## Security and resource boundaries

S-PDF accepts untrusted PDF, image and Office files. The endpoints must enforce byte limits on the actual uploaded data, not only on `Content-Length`. Enforce concurrency and operation limits, conversion timeouts and isolated temporary storage. Do not expose converter internals or stack traces to clients.

Current routes are not evidence of hardened production resource isolation. Deploy publicly only after adding upload streaming limits, endpoint tests, dependency audits, rate controls and a documented threat model.

## Storage and privacy

The Node/pdf-lib endpoints commonly operate on in-memory buffers. The Python converter **does use temporary directories/files for certain conversions**, even though the temporary directory is removed after a request. Do not claim all operations are memory-only.

Self-hosting controls where uploads are processed; it does not remove the need for host security, retention policies, logs review and external-service scrutiny.

## Deployment checks

1. Build frontend and API.
2. Import and test Python application.
3. Run a representative PDF operation against each configured API backend.
4. Verify reverse proxy request and response limits, timeout and CORS behavior.
5. Confirm PDF-to-Word and Word-to-PDF availability in the deployed environment.
6. Check that sensitive test fixtures are not present in logs or release artifacts.
