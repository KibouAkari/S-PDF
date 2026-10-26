# Contributing to S-PDF

Thanks for taking the time to contribute! This project is a small monorepo —
here's how to get set up and what we expect from a good pull request.

## Project layout

```
apps/web/          React + Vite frontend
apps/api/           Express + pdf-lib API (local/Docker backend)
services/converter/ FastAPI service — pdf2docx, PyMuPDF, LibreOffice; also
                     hosts the full PDF API for the Vercel deployment
```

See [README.md](README.md) for the full stack overview and local setup steps.

## Development setup

Use a Python virtual environment, then:

```bash
npm install --workspaces
python -m venv .venv
source .venv/bin/activate
npm run converter:install
cp apps/api/.env.example apps/api/.env
npm run converter:dev
```

On Windows, use `.venv\Scripts\Activate.ps1` and `Copy-Item` for the environment file. Start `npm run dev` in a second terminal.

## Editor architecture and testing

Native source edits are handled by `services/converter/editor_native.py` through the Python converter API, including when the web app uses the Node API. Overlays remain supported by both PDF engines. Native content extraction and destructive changes are **not** available from `pdf-lib` alone.

Before opening a PR that changes PDF editing, run both builds, Python unit/HTTP contract tests, and Chromium browser workflow. Add fixture PDFs for every corrected regression. Include screenshots only when they accurately reflect the current UI. Read [Native Editing](docs/NATIVE_EDITING.md), [Testing](docs/TESTING.md), and [Licensing](docs/LICENSING.md).

### Python tests

```bash
PYTHONPATH=services/converter python -m unittest discover -s services/converter/tests -v
```

## Before opening a pull request

- **Type-check both TypeScript apps:**
  ```powershell
  npm run build -w apps/web
  npm run build -w apps/api
  ```
- **Keep the Node (`apps/api`) and Python (`services/converter`) PDF endpoints
  in sync.** Most PDF operations are implemented twice — once with `pdf-lib`
  (Node) and once with `PyMuPDF` (Python) — because Vercel deployments only
  run the Python service. If you change behavior in one, mirror it in the
  other.
- Keep pull requests focused — one feature or fix per PR is easier to review.
- Add a short description of what changed and why, and call out any manual
  testing you did (e.g. "tested merge + rotate locally with a 20-page PDF").

## Reporting bugs / requesting features

Please use the issue templates under `.github/ISSUE_TEMPLATE`. Include repro
steps, the tool/page involved, and (if relevant) a sample PDF that isn't
sensitive/private.

## Code style

- TypeScript: keep things typed, avoid `any` where practical, prefer small
  focused components/functions.
- Python: keep endpoints in `services/converter` self-contained and stateless
  (no writing to disk unless strictly necessary, e.g. LibreOffice/pdf2docx).
- No unnecessary comments — code should be readable on its own; comment only
  what isn't obvious from the code itself.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Please be
respectful and constructive.
