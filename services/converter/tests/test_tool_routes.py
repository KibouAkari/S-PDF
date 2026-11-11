"""HTTP regression tests for the public PDF tools and conversion contract."""
import io
import json
import shutil
import unittest
import zipfile
from unittest.mock import patch

import fitz
from fastapi.testclient import TestClient
from PIL import Image

from main import app


def pdf_file(payload):
    return {"file": ("sample.pdf", payload, "application/pdf")}


def make_pdf(with_image=False):
    doc = fitz.open()
    for label in ("First page", "Second page"):
        page = doc.new_page(width=420, height=595)
        page.insert_text((40, 65), label, fontsize=14)
        if with_image and label == "First page":
            image = Image.effect_noise((2200, 1450), 75).convert("RGB")
            out = io.BytesIO()
            image.save(out, format="PNG")
            page.insert_image(fitz.Rect(40, 110, 380, 390), stream=out.getvalue())
    result = doc.tobytes()
    doc.close()
    return result


class PdfToolRoutesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.pdf = make_pdf()

    def test_health_and_pdf_info(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "ok")
        self.assertIn("wordToPdf", health.json())
        info = self.client.post("/api/pdf/info", files=pdf_file(self.pdf))
        self.assertEqual(info.status_code, 200, info.text)
        self.assertEqual(info.json()["pageCount"], 2)

    def test_rejects_invalid_pdf(self):
        response = self.client.post("/api/pdf/info", files=pdf_file(b"not a pdf"))
        self.assertEqual(response.status_code, 400)

    def test_measured_upload_cap(self):
        with patch("upload_limits.MAX_UPLOAD_BYTES", 16):
            response = self.client.post("/api/pdf/info", files=pdf_file(self.pdf))
        self.assertEqual(response.status_code, 413, response.text)

    def test_merge_reorder_rotate_and_plan_validation(self):
        plan = [
            {"fileIndex": 0, "pageIndex": 1, "rotate": 90},
            {"fileIndex": 0, "pageIndex": 0},
        ]
        result = self.client.post(
            "/api/pdf/organize",
            files=[("files", ("sample.pdf", self.pdf, "application/pdf"))],
            data={"plan": json.dumps(plan)},
        )
        self.assertEqual(result.status_code, 200, result.text[:200])
        with fitz.open(stream=result.content, filetype="pdf") as doc:
            self.assertEqual(doc.page_count, 2)
            self.assertEqual(doc[0].rotation, 90)
            self.assertIn("Second page", doc[0].get_text())
            self.assertIn("First page", doc[1].get_text())
        invalid = self.client.post(
            "/api/pdf/organize",
            files=[("files", ("sample.pdf", self.pdf, "application/pdf"))],
            data={"plan": '["unexpected string"]'},
        )
        self.assertEqual(invalid.status_code, 400)

    def test_split_ranges_and_invalid_input(self):
        result = self.client.post("/api/pdf/split", files=pdf_file(self.pdf), data={"ranges": "1-1,2-2"})
        self.assertEqual(result.status_code, 200, result.text[:200])
        with zipfile.ZipFile(io.BytesIO(result.content)) as archive:
            self.assertEqual(archive.namelist(), ["part-1.pdf", "part-2.pdf"])
            for name in archive.namelist():
                with fitz.open(stream=archive.read(name), filetype="pdf") as doc:
                    self.assertEqual(doc.page_count, 1)
        invalid = self.client.post("/api/pdf/split", files=pdf_file(self.pdf), data={"ranges": "1-999999999"})
        self.assertEqual(invalid.status_code, 400)

    def test_watermark_and_page_numbers(self):
        watermark = self.client.post(
            "/api/pdf/watermark",
            files=pdf_file(self.pdf),
            data={"text": "DRAFT", "rotationDeg": "0", "position": "center"},
        )
        self.assertEqual(watermark.status_code, 200, watermark.text[:200])
        with fitz.open(stream=watermark.content, filetype="pdf") as doc:
            self.assertEqual(doc.page_count, 2)
            self.assertIn("DRAFT", doc[0].get_text())
        numbers = self.client.post(
            "/api/pdf/page-numbers",
            files=pdf_file(self.pdf),
            data={"format": "Page {n} of {total}", "startAt": "1"},
        )
        self.assertEqual(numbers.status_code, 200, numbers.text[:200])
        with fitz.open(stream=numbers.content, filetype="pdf") as doc:
            self.assertIn("Page 1 of 2", doc[0].get_text())
            self.assertIn("Page 2 of 2", doc[1].get_text())

    def test_png_jpeg_and_webp_to_pdf(self):
        uploads = []
        for fmt in ("PNG", "JPEG", "WEBP"):
            img = Image.new("RGB", (64, 48), "red")
            buf = io.BytesIO()
            img.save(buf, format=fmt)
            uploads.append(
                ("files", (f"sample.{fmt.lower()}", buf.getvalue(), f"image/{fmt.lower()}"))
            )
        result = self.client.post("/api/pdf/images-to-pdf", files=uploads)
        self.assertEqual(result.status_code, 200, result.text[:200])
        with fitz.open(stream=result.content, filetype="pdf") as doc:
            self.assertEqual(doc.page_count, 3)
            for page in doc:
                self.assertEqual(len(page.get_images()), 1)

    def test_pdf_to_word_returns_editable_docx(self):
        from docx import Document
        response = self.client.post(
            "/api/convert/pdf-to-word",
            files=pdf_file(self.pdf),
        )
        self.assertEqual(response.status_code, 200, response.text[:200])
        self.assertTrue(response.content.startswith(b"PK"))
        converted = Document(io.BytesIO(response.content))
        text = "\\n".join(p.text for p in converted.paragraphs)
        self.assertIn("First page", text)

    def test_pdf_to_png_zip(self):
        result = self.client.post(
            "/api/convert/pdf-to-images",
            files=pdf_file(self.pdf),
            data={"dpi": "96"},
        )
        self.assertEqual(result.status_code, 200, result.text[:200])
        with zipfile.ZipFile(io.BytesIO(result.content)) as archive:
            self.assertEqual(archive.namelist(), ["page-1.png", "page-2.png"])
            self.assertEqual(archive.read("page-1.png")[:8], bytes([137, 80, 78, 71, 13, 10, 26, 10]))

    def test_compression_preserves_valid_image_objects(self):
        original = make_pdf(with_image=True)
        result = self.client.post(
            "/api/convert/compress",
            files=pdf_file(original),
            data={"level": "medium"},
        )
        self.assertEqual(result.status_code, 200, result.text[:200])
        self.assertLessEqual(len(result.content), len(original))
        with fitz.open(stream=result.content, filetype="pdf") as doc:
            self.assertEqual(doc.page_count, 2)
            self.assertIn("First page", doc[0].get_text())
            images = doc[0].get_images()
            self.assertEqual(len(images), 1)
            data = doc.extract_image(images[0][0])
            self.assertTrue(data["image"])
            self.assertLessEqual(max(data["width"], data["height"]), 1400)
            self.assertTrue(doc[0].get_pixmap().samples)

    def test_word_to_pdf_reports_missing_engine_without_leaking_paths(self):
        with patch("main._soffice_path", return_value=None):
            response = self.client.post(
                "/api/convert/word-to-pdf",
                files={"file": ("letter.docx", b"PK\\x03\\x04", "application/octet-stream")},
            )
        self.assertEqual(response.status_code, 503)
        self.assertIn("LibreOffice", response.json()["detail"])

    @unittest.skipUnless(shutil.which("soffice") or shutil.which("libreoffice"), "LibreOffice absent")
    def test_word_to_pdf_with_real_engine(self):
        from docx import Document
        document = Document()
        document.add_paragraph("Office smoke test")
        buf = io.BytesIO()
        document.save(buf)
        result = self.client.post(
            "/api/convert/word-to-pdf",
            files={"file": ("letter.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
        self.assertEqual(result.status_code, 200, result.text[:200])
        with fitz.open(stream=result.content, filetype="pdf") as doc:
            self.assertIn("Office smoke test", doc[0].get_text())


if __name__ == "__main__":
    unittest.main()
