# Security Policy

## Supported Versions

S-PDF is currently pre-1.0 and distributed as a single rolling `main` branch.
Security fixes are applied to the latest commit only.

## Reporting a Vulnerability

If you discover a security vulnerability (e.g. path traversal, SSRF via file
uploads, arbitrary code execution through a crafted PDF/DOCX, dependency
vulnerabilities with real-world impact), please **do not open a public
issue**. Instead:

1. Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
   feature on this repository, or
2. Contact the maintainer directly via the profile linked on the GitHub repo.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal PDF/DOCX sample if relevant)
- Any suggested remediation, if you have one

We'll acknowledge reports within a few days and aim to ship a fix as quickly
as possible given the scope.

## Notes on this project's threat model

- Uploaded files are processed in memory / temporary storage and are not
  persisted after a request completes.
- The converter service (`services/converter`) shells out to LibreOffice for
  Word→PDF conversion; it only accepts `.doc`/`.docx` uploads and runs with a
  timeout, but treat any deployment exposed to untrusted users as running
  third-party document parsers (PyMuPDF, pdf2docx, LibreOffice) — keep these
  dependencies up to date.
