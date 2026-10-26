# Quality gates and release checklist

## Existing automated checks

`.github/workflows/ci.yml` builds the Node API and web app, and imports the Python converter. It currently does **not** run a complete cross-backend test suite, visual editor tests or production deployment smoke tests.

## Recommended CI expansion

- JavaScript and Python formatting/linting.
- Unit tests for object conversion, coordinate transforms and validation.
- The same API contract tests against Node and Python.
- Browser tests for page switching, drag/resize, export and error handling.
- Golden-file checks for multi-page PDFs, mixed media, fonts, rotated pages and crop boxes.
- Dependency scanning, basic SAST and upload-fuzzing test fixtures.
- Docker smoke tests with real converter and LibreOffice dependencies.

## Before each release

1. Verify all advertised README features on the supported deployment targets.
2. Verify exported files open in multiple PDF viewers.
3. Ensure a text overlay is not described as text replacement and a cover rectangle is not described as redaction.
4. Check license compliance for bundled dependencies and fonts.
5. Record confirmed changes and known limitations in `CHANGELOG.md`.
6. Validate examples and commands on a clean checkout.

## Definitions

- **Supported:** implemented, tested and documented for the named deployment mode.
- **Experimental:** available but subject to clearly documented limitations.
- **Planned:** not implemented, and not advertised as a supported feature.
