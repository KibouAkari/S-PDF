# Licensing and third-party obligations

S-PDF's own project files are published under the license in the repository's [LICENSE](../LICENSE). **That license does not override dependency licenses.**

In particular, the Python converter uses **PyMuPDF / MuPDF**, which is offered under **GNU AGPLv3 or a commercial license** by Artifex. Depending on how the converter and combined application are packaged, modified, distributed or hosted, AGPL compliance obligations can apply, including corresponding-source availability for network users. A public GitHub repository under MIT is not itself proof of compliance.

Other components include pdf.js (Apache 2.0), Fabric.js (MIT), pdf-lib (MIT), React (MIT), and additional dependencies with their own notices and license terms. Review actual lockfiles and installed distributions for authoritative license metadata.

## Required before a public production release

1. Decide and document the license of the **combined deployed work**, including the Python converter and its dependencies.
2. Preserve third-party notices and attribution, and provide corresponding source where required.
3. Validate AGPL requirements with qualified legal advice or obtain the appropriate commercial rights.
4. Generate a versioned third-party dependency license report in CI for frontend, API and Python.
5. Document build instructions and how network users obtain the exact source of the deployed version.
6. Check trademark and branding use. S-PDF is not affiliated with Adobe or LibreOffice.

For official terms, see https://pymupdf.io/licensing and the license files included in each dependency. This is a compliance checklist, not legal advice.
