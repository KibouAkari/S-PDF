"""HTTP contract tests for native editing API."""
import json
import unittest

import fitz
from fastapi.testclient import TestClient

from main import app


class EditorApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        pdf = fitz.open()
        page = pdf.new_page(width=420, height=600)
        page.insert_text((70, 110), "Test document", fontsize=14)
        self.pdf = pdf.tobytes()
        pdf.close()

    def _pdf_file(self):
        return {"file": ("test.pdf", self.pdf, "application/pdf")}

    def test_inspect_and_replace_http(self):
        inspect = self.client.post("/api/pdf/content", files=self._pdf_file(), data={"page": "0"})
        self.assertEqual(inspect.status_code, 200, inspect.text)
        objects = inspect.json()["elements"]
        source = next(obj for obj in objects if obj["type"] == "text")
        x0, y0, x1, y1 = source["rect"]
        edits = [{
            "type": "source", "page": 0, "elementId": source["id"], "action": "replace",
            "x": x0, "y": y0, "width": 200, "height": 35, "text": "Updated document",
            "font": "helvetica", "size": 14, "color": "#000000"
        }]
        result = self.client.post("/api/pdf/edit", files=self._pdf_file(),
                                  data={"objects": json.dumps(edits)})
        self.assertEqual(result.status_code, 200, result.text[:1000])
        updated = fitz.open(stream=result.content, filetype="pdf")
        output = updated[0].get_text()
        self.assertIn("Updated document", output)
        self.assertNotIn("Test document", output)
        updated.close()

    def test_rejects_invalid_page(self):
        response = self.client.post("/api/pdf/content", files=self._pdf_file(), data={"page": "999"})
        self.assertEqual(response.status_code, 400)

    def test_rejects_unknown_source_id(self):
        edits = [{"type": "source", "page": 0, "elementId": "t-500-0-0", "action": "delete"}]
        response = self.client.post("/api/pdf/edit", files=self._pdf_file(),
                                    data={"objects": json.dumps(edits)})
        self.assertEqual(response.status_code, 400)

    def test_mixed_edits_preserve_overlay_font_family_and_style(self):
        edits = [
            {"type": "source", "page": 0, "elementId": "t-0-0-0", "action": "delete"},
            {
                "type": "text", "page": 0, "x": 70, "y": 180, "text": "Times bold",
                "size": 14, "font": "times", "bold": True,
            },
            {
                "type": "text", "page": 0, "x": 70, "y": 220, "text": "Courier italic",
                "size": 14, "font": "courier", "italic": True,
            },
        ]
        result = self.client.post("/api/pdf/edit", files=self._pdf_file(),
                                  data={"objects": json.dumps(edits)})
        self.assertEqual(result.status_code, 200, result.text[:1000])
        updated = fitz.open(stream=result.content, filetype="pdf")
        spans = [
            span
            for block in updated[0].get_text("dict")["blocks"]
            for line in block.get("lines", [])
            for span in line["spans"]
        ]
        fonts = {span["text"]: span["font"] for span in spans}
        self.assertIn("Times", fonts["Times bold"])
        self.assertIn("Bold", fonts["Times bold"])
        self.assertIn("Courier", fonts["Courier italic"])
        self.assertIn("Oblique", fonts["Courier italic"])
        updated.close()


if __name__ == "__main__":
    unittest.main()
