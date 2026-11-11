"""Non-destructive live acceptance tests for a PUBLIC S-PDF deployment.

Only synthetic PDF, DOCX and image fixtures are uploaded. This is a low-volume
functional smoke test, not a load test or security scan. No user files are read.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
import zipfile

import fitz
import httpx
from docx import Document
from PIL import Image

CHECKS: list[tuple[str, str, str, float]] = []
BASE = ""


def check(name, fn):
    start = time.monotonic()
    try:
        result = fn()
        CHECKS.append(("PASS", name, str(result or "OK"), time.monotonic() - start))
    except Exception as exc:
        CHECKS.append(("FAIL", name, str(exc)[:240], time.monotonic() - start))


def expect_response(res, code=200):
    if res.status_code != code:
        msg = res.text[:220].replace("\n", " ")
        raise AssertionError(f"HTTP {res.status_code}, expected {code}; {msg}")
    return res


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def post(client, path, files=None, data=None, code=200):
    response = client.post(path, files=files, data=data)
    return expect_response(response, code)


def pdf_files(blob):
    return {"file": ("synthetic-fixture.pdf", blob, "application/pdf")}


def open_pdf(blob):
    require(blob.startswith(b"%PDF-"), "Response does not start with %PDF-")
    return fitz.open(stream=blob, filetype="pdf")


def make_pdf():
    doc = fitz.open()
    for text in ("S-PDF TEST FIRST", "S-PDF TEST SECOND"):
        page = doc.new_page(width=420, height=595)
        page.insert_text((52, 92), text, fontsize=14)
    data = doc.tobytes()
    doc.close()
    return data


def make_docx():
    doc = Document()
    doc.add_heading("S-PDF QA DOCUMENT", 1)
    doc.add_paragraph("This is a synthetic conversion check with plain text.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_images():
    files = []
    for fmt in ("PNG", "JPEG", "WEBP"):
        img = Image.new("RGBA" if fmt != "JPEG" else "RGB", (44, 35), (20, 120, 200, 240) if fmt != "JPEG" else (20, 120, 200))
        buf = io.BytesIO()
        img.save(buf, format=fmt)
        files.append(("files", (f"synthetic.{fmt.lower()}", buf.getvalue(), f"image/{fmt.lower()}")))
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://simi-pdf.vercel.app")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    require(base.startswith("https://"), "Only HTTPS target URLs are allowed")
    pdf = make_pdf()
    docx = make_docx()
    with httpx.Client(base_url=base, follow_redirects=False, timeout=httpx.Timeout(130.0, connect=15.0), headers={"User-Agent": "S-PDF-QA/1.0"}) as client:
        def home():
            response = expect_response(client.get("/"))
            require("<html" in response.text.lower(), "Home did not return HTML")
            require("src=" in response.text or "script" in response.text, "HTML has no application script")
            return "HTML loaded"

        def route():
            response = expect_response(client.get("/tools/word-to-pdf"))
            require("<html" in response.text.lower(), "Frontend route is not served")
            return "Frontend deep link loaded"

        def health():
            response = expect_response(client.get("/api/health"))
            data = response.json()
            require(data.get("status") == "ok", f"API unhealthy: {data}")
            require(data.get("libreoffice") is True, f"LibreOffice missing: {data}")
            return "API OK, LibreOffice installed"

        def info():
            data = post(client, "/api/pdf/info", pdf_files(pdf)).json()
            require(data.get("pageCount") == 2, f"Wrong page count: {data}")
            return "2 pages"

        def organize():
            plan = [{"fileIndex": 0, "pageIndex": 1, "rotate": 90},
                    {"fileIndex": 0, "pageIndex": 0}]
            output = post(client, "/api/pdf/organize", files=[("files", ("synthetic.pdf", pdf, "application/pdf"))], data={"plan": json.dumps(plan)})
            with open_pdf(output.content) as doc:
                require(doc.page_count == 2 and doc[0].rotation == 90, "Order/rotation not retained")
                require("SECOND" in doc[0].get_text() and "FIRST" in doc[1].get_text(), "Page order incorrect")
            return "Page order and rotation OK"

        def split():
            output = post(client, "/api/pdf/split", pdf_files(pdf), {"ranges": "1-1,2-2"})
            with zipfile.ZipFile(io.BytesIO(output.content)) as zf:
                require(zf.namelist() == ["part-1.pdf", "part-2.pdf"], "ZIP file naming incorrect")
                for i, filename in enumerate(zf.namelist()):
                    with open_pdf(zf.read(filename)) as doc:
                        require(doc.page_count == 1, "Split member has wrong page count")
                        require(("FIRST" if i == 0 else "SECOND") in doc[0].get_text(), "Split content wrong")
            return "2 valid PDF members"

        def page_numbers():
            result = post(client, "/api/pdf/page-numbers", pdf_files(pdf),
                          {"format": "Page {n} of {total}", "startAt": "3", "position": "bottom-right"})
            with open_pdf(result.content) as doc:
                require("Page 3 of 2" in doc[0].get_text(), "First page number missing")
                require("Page 4 of 2" in doc[1].get_text(), "Second page number missing")
            return "Start number, position, formatting"

        def watermark(position):
            result = post(client, "/api/pdf/watermark", pdf_files(pdf),
                          {"text": "TESTMARK", "position": position, "rotationDeg": "0", "opacity": "0.5"})
            with open_pdf(result.content) as doc:
                require(doc.page_count == 2, "Watermark damaged page count")
                require("TESTMARK" in doc[0].get_text(), f"{position}: no watermark text found")
            return f"{position} watermark OK"

        def images_to_pdf():
            result = post(client, "/api/pdf/images-to-pdf", files=make_images())
            with open_pdf(result.content) as doc:
                require(doc.page_count == 3, f"Expected 3 images, got {doc.page_count}")
                for page in doc:
                    require(len(page.get_images()) == 1, "An image was not embedded")
                    require(len(page.get_pixmap().samples) > 10, "Image page would not render")
            return "PNG/JPEG/WEBP all embedded"

        def pdf_to_images():
            result = post(client, "/api/convert/pdf-to-images", pdf_files(pdf), {"dpi": "96"})
            with zipfile.ZipFile(io.BytesIO(result.content)) as zf:
                require(zf.namelist() == ["page-1.png", "page-2.png"], "Incorrect PNG ZIP list")
                for name in zf.namelist():
                    image = zf.read(name)
                    require(image.startswith(bytes([137, 80, 78, 71, 13, 10, 26, 10])), "Invalid PNG")
                    with Image.open(io.BytesIO(image)) as png:
                        require(png.width >= 500, "Incorrect DPI output")
            return "2 valid 96-DPI PNG files"

        def compress():
            result = post(client, "/api/convert/compress", pdf_files(pdf), {"level": "medium"})
            require(len(result.content) <= len(pdf), "Compression increased file size")
            with open_pdf(result.content) as doc:
                require("FIRST" in doc[0].get_text(), "Compressed PDF lost content")
            return "Document valid, no file size increase"

        def pdf_to_word():
            result = post(client, "/api/convert/pdf-to-word", pdf_files(pdf))
            require(result.content.startswith(b"PK"), "Not a DOCX ZIP")
            output = Document(io.BytesIO(result.content))
            paragraphs = "\n".join(x.text for x in output.paragraphs)
            require("S-PDF" in paragraphs, "Converted Word file lost text")
            return "DOCX opens and contains original text"

        def word_to_pdf():
            result = post(client, "/api/convert/word-to-pdf",
                          {"file": ("synthetic.docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
            with open_pdf(result.content) as doc:
                require(doc.page_count >= 1, "Word converter made empty PDF")
                require("S-PDF QA DOCUMENT" in doc[0].get_text(), "Converted PDF lost text")
            return "DOCX converted, PDF text verified"

        def editor_content():
            data = post(client, "/api/pdf/content", pdf_files(pdf), {"page": "0"}).json()
            require(isinstance(data.get("elements"), list), "Editor content is not a list")
            require(any(e.get("type") == "text" for e in data["elements"]), "Original text not detected")
            return f"{len(data['elements'])} elements inspected"

        def editor_overlay():
            edits = [{"type": "text", "page": 0, "x": 60, "y": 210,
                      "text": "ADDED LIVE TEXT", "size": 14, "font": "helvetica", "color": "#222222"}]
            result = post(client, "/api/pdf/edit", pdf_files(pdf), {"objects": json.dumps(edits)})
            with open_pdf(result.content) as doc:
                require("ADDED LIVE TEXT" in doc[0].get_text(), "Editor overlay not saved")
                require("S-PDF TEST FIRST" in doc[0].get_text(), "Original PDF text was removed")
            return "Added text and original text retained"

        def editor_native_replace():
            data = post(client, "/api/pdf/content", pdf_files(pdf), {"page": "0"}).json()
            elem = next(e for e in data["elements"] if e.get("type") == "text")
            x0,y0,x1,y1 = elem["rect"]
            edits = [{"type": "source", "page": 0, "elementId": elem["id"],
                      "action": "replace", "x": x0, "y": y0, "width": 250,
                      "height": 40, "text": "EDITED LIVE TEXT", "size": 14,
                      "font": "helvetica", "color": "#000000"}]
            result = post(client, "/api/pdf/edit", pdf_files(pdf), {"objects": json.dumps(edits)})
            with open_pdf(result.content) as doc:
                require("EDITED LIVE TEXT" in doc[0].get_text(), "Native text replace failed")
                require("S-PDF TEST FIRST" not in doc[0].get_text(), "Old source text retained")
            return "Source span replaced and exported"

        def invalid_pdf():
            post(client, "/api/pdf/info",
                 {"file": ("broken.pdf", b"not a pdf", "application/pdf")}, code=400)
            return "Invalid PDF cleanly rejected"

        checks = [
            ("Homepage", home),
            ("Deep-link navigation", route),
            ("API health and LibreOffice", health),
            ("PDF info", info),
            ("Merge, reorder and rotate", organize),
            ("Split PDF", split),
            ("Page numbers", page_numbers),
            ("Watermark centered", lambda: watermark("center")),
            ("Watermark tiled", lambda: watermark("tile")),
            ("Images to PDF: PNG/JPEG/WEBP", images_to_pdf),
            ("PDF to Images (96 DPI)", pdf_to_images),
            ("Compress PDF", compress),
            ("PDF to Word", pdf_to_word),
            ("Word to PDF", word_to_pdf),
            ("Editor native element inspection", editor_content),
            ("Editor overlay export", editor_overlay),
            ("Editor native text replacement", editor_native_replace),
            ("Invalid PDF handling", invalid_pdf),
        ]
        for name, fn in checks:
            check(name, fn)

    print(f"Target: {base}")
    for outcome, name, detail, elapsed in CHECKS:
        print(f"{outcome:4s} | {name:34s} | {elapsed:6.2f}s | {detail}")
    failures = sum(outcome == "FAIL" for outcome, *_ in CHECKS)
    print(f"TOTAL {len(CHECKS)} | PASS {len(CHECKS) - failures} | FAIL {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
