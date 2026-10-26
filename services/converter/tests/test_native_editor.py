"""Regression tests for real PDF content edits.

Run with: PYTHONPATH=services/converter python -m unittest discover -s services/converter/tests -v
"""
import unittest

import fitz

from editor_native import apply_source_edits, elements_for_page


class NativeEditorTests(unittest.TestCase):
    def setUp(self):
        self.doc = fitz.open()
        self.page = self.doc.new_page(width=420, height=600)
        self.page.insert_text((70, 100), "Original text", fontsize=14, fontname="helv")

    def tearDown(self):
        self.doc.close()

    def source(self):
        matches = [e for e in elements_for_page(self.page) if e["type"] == "text"]
        self.assertEqual(len(matches), 1)
        return matches[0]

    def test_detects_native_text(self):
        element = self.source()
        self.assertEqual(element["text"], "Original text")
        self.assertEqual(element["type"], "text")
        self.assertEqual(len(element["rect"]), 4)

    def test_exposes_native_text_bold_and_italic_flags(self):
        self.page.insert_text((70, 180), "Bold text", fontsize=14, fontname="hebo")
        self.page.insert_text((70, 220), "Italic text", fontsize=14, fontname="heit")
        spans = {item["text"]: item for item in elements_for_page(self.page) if item["type"] == "text"}
        self.assertTrue(spans["Bold text"]["bold"])
        self.assertFalse(spans["Bold text"]["italic"])
        self.assertFalse(spans["Italic text"]["bold"])
        self.assertTrue(spans["Italic text"]["italic"])

    def test_replace_removes_original_text(self):
        element = self.source()
        x0, y0, x1, y1 = element["rect"]
        apply_source_edits(self.doc, [{
            "type": "source", "page": 0, "elementId": element["id"], "action": "replace",
            "x": x0, "y": y0, "width": max(180, x1 - x0), "height": max(30, y1 - y0),
            "text": "New content", "size": 14, "font": "helvetica", "color": "#000000",
        }])
        reopened = fitz.open(stream=self.doc.tobytes(garbage=4, deflate=True), filetype="pdf")
        content = reopened[0].get_text()
        self.assertNotIn("Original text", content)
        self.assertIn("New content", content)
        reopened.close()

    def test_delete_removes_source_text(self):
        element = self.source()
        apply_source_edits(self.doc, [{
            "type": "source", "page": 0, "elementId": element["id"], "action": "delete",
        }])
        self.assertNotIn("Original text", self.page.get_text())

    def test_move_changes_position(self):
        element = self.source()
        apply_source_edits(self.doc, [{
            "type": "source", "page": 0, "elementId": element["id"], "action": "move",
            "x": 150, "y": 180, "width": 190, "height": 35,
            "text": "Original text", "size": 14,
        }])
        blocks = [e for e in elements_for_page(self.page) if e["type"] == "text"]
        self.assertEqual(len(blocks), 1)
        self.assertGreater(blocks[0]["rect"][0], 145)

    def test_rejects_duplicate_source_id(self):
        element = self.source()
        edit = {"type": "source", "page": 0, "elementId": element["id"], "action": "delete"}
        with self.assertRaises(Exception):
            apply_source_edits(self.doc, [edit, edit])

    def test_move_existing_vector_rectangle(self):
        self.page.draw_rect(fitz.Rect(220, 220, 280, 260), color=(1, 0, 0),
                            fill=(0, 1, 0), width=1.5)
        vectors = [e for e in elements_for_page(self.page) if e["type"] == "shape"]
        self.assertTrue(vectors)
        apply_source_edits(self.doc, [{
            "type": "source", "page": 0, "elementId": vectors[0]["id"],
            "action": "move", "x": 310, "y": 310, "width": 60, "height": 40,
        }])
        boxes = [fitz.Rect(d["rect"]) for d in self.page.get_drawings()]
        self.assertTrue(any(b.x0 >= 300 and b.y0 >= 300 for b in boxes), boxes)
        self.assertFalse(any(b.x0 <= 220 and b.y0 <= 220 for b in boxes), boxes)

    def test_move_native_raster_image_removes_old_placement(self):
        pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 12, 12), False)
        self.page.insert_image(fitz.Rect(40, 200, 130, 290), pixmap=pix)
        images = [e for e in elements_for_page(self.page) if e["type"] == "image"]
        self.assertEqual(len(images), 1)
        apply_source_edits(self.doc, [{
            "type": "source", "page": 0, "elementId": images[0]["id"],
            "action": "move", "x": 170, "y": 320,
            "width": 120, "height": 110,
        }])
        reopened = fitz.open(stream=self.doc.tobytes(garbage=4, deflate=True), filetype="pdf")
        result = [e for e in elements_for_page(reopened[0]) if e["type"] == "image"]
        self.assertTrue(any(e["rect"][0] > 160 and e["rect"][1] > 310 for e in result), result)
        self.assertFalse(any(e["rect"][0] < 140 and e["rect"][1] < 300 for e in result), result)
        reopened.close()

    def test_swapping_native_text_spans_preserves_both_replacements(self):
        self.page.insert_text((70, 180), "Alpha", fontsize=14)
        self.page.insert_text((250, 180), "Bravo", fontsize=14)
        spans = {item["text"]: item for item in elements_for_page(self.page) if item["type"] == "text"}
        alpha, bravo = spans["Alpha"], spans["Bravo"]
        apply_source_edits(self.doc, [
            {
                "type": "source", "page": 0, "elementId": alpha["id"], "action": "move",
                "x": bravo["rect"][0], "y": bravo["rect"][1], "width": 100, "height": 35,
                "text": "Alpha", "size": 14,
            },
            {
                "type": "source", "page": 0, "elementId": bravo["id"], "action": "move",
                "x": alpha["rect"][0], "y": alpha["rect"][1], "width": 100, "height": 35,
                "text": "Bravo", "size": 14,
            },
        ])
        moved = {item["text"]: item for item in elements_for_page(self.page) if item["type"] == "text"}
        self.assertGreater(moved["Alpha"]["rect"][0], 200)
        self.assertLess(moved["Bravo"]["rect"][0], 150)

    def test_swapping_native_images_preserves_both_replacements(self):
        small = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 12, 12), False)
        large = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 18, 18), False)
        self.page.insert_image(fitz.Rect(40, 200, 130, 290), pixmap=small)
        self.page.insert_image(fitz.Rect(250, 200, 360, 310), pixmap=large)
        images = [item for item in elements_for_page(self.page) if item["type"] == "image"]
        self.assertEqual(len(images), 2)
        first, second = images
        apply_source_edits(self.doc, [
            {
                "type": "source", "page": 0, "elementId": first["id"], "action": "move",
                "x": second["rect"][0], "y": second["rect"][1],
                "width": first["rect"][2] - first["rect"][0],
                "height": first["rect"][3] - first["rect"][1],
            },
            {
                "type": "source", "page": 0, "elementId": second["id"], "action": "move",
                "x": first["rect"][0], "y": first["rect"][1],
                "width": second["rect"][2] - second["rect"][0],
                "height": second["rect"][3] - second["rect"][1],
            },
        ])
        moved = [item for item in elements_for_page(self.page) if item["type"] == "image"]
        self.assertEqual(len(moved), 2, moved)
        self.assertTrue(any(item["rect"][0] > 200 for item in moved), moved)
        self.assertTrue(any(item["rect"][0] < 150 for item in moved), moved)

    def test_move_horizontal_and_vertical_native_lines(self):
        self.page.draw_line((80, 250), (200, 250), color=(1, 0, 0), width=2)
        self.page.draw_line((240, 260), (240, 400), color=(0, 0, 1), width=2)
        lines = [item for item in elements_for_page(self.page) if item["type"] == "shape"]
        self.assertEqual(len(lines), 2)
        edits = []
        for item in lines:
            x0, y0, x1, y1 = item["rect"]
            edits.append({
                "type": "source", "page": 0, "elementId": item["id"], "action": "move",
                "x": x0 + 100, "y": y0 + 80, "width": x1 - x0, "height": y1 - y0,
            })
        apply_source_edits(self.doc, edits)
        moved_lines = [
            next(command for command in drawing["items"] if command[0] == "l")
            for drawing in self.page.get_drawings()
            if any(command[0] == "l" for command in drawing["items"])
        ]
        self.assertEqual(len(moved_lines), 2)
        horizontal = next(command for command in moved_lines if abs(command[1].y - command[2].y) < 0.01)
        vertical = next(command for command in moved_lines if abs(command[1].x - command[2].x) < 0.01)
        self.assertGreaterEqual(min(horizontal[1].x, horizontal[2].x), 175, horizontal)
        self.assertGreaterEqual(min(vertical[1].y, vertical[2].y), 335, vertical)

    def test_image_blocks_are_discoverable(self):
        # A second page with a raster image rather than glyphs mimics a scanned PDF.
        image_page = self.doc.new_page(width=420, height=600)
        pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 12, 12), False)
        image_page.insert_image(fitz.Rect(50, 50, 200, 200), pixmap=pix)
        image_elements = [e for e in elements_for_page(image_page) if e["type"] == "image"]
        self.assertTrue(image_elements)


if __name__ == "__main__":
    unittest.main()
