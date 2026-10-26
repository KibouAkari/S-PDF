"""Inspectable native PDF elements and conservative source edits.

Coordinates are PyMuPDF page coordinates (points, top-left). Unlike overlay
annotations, source edits remove the selected content before redrawing it.
Text reconstruction is not lossless and can affect touching glyphs or artwork.
"""
from __future__ import annotations

import math
from collections import defaultdict

import fitz
from fastapi import HTTPException

FONT_NAMES = {
    "helvetica": ("helv", "hebo", "heit", "hebi"),
    "times": ("tiro", "tibo", "tiit", "tibi"),
    "courier": ("cour", "cobo", "coit", "cobi"),
}


def elements_for_page(page: fitz.Page) -> list[dict]:
    """Return selectable text spans and image blocks with stable IDs for this original page."""
    elements: list[dict] = []
    blocks = page.get_text("dict").get("blocks", [])
    for bi, block in enumerate(blocks):
        if block.get("type") == 0:
            for li, line in enumerate(block.get("lines", [])):
                for si, span in enumerate(line.get("spans", [])):
                    if not span.get("text", "").strip():
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    if x1 <= x0 or y1 <= y0:
                        continue
                    elements.append({
                        "id": f"t-{bi}-{li}-{si}", "type": "text", "text": span["text"],
                        "rect": [x0, y0, x1, y1],
                        "fontSize": span.get("size", 12),
                        "fontName": span.get("font", ""),
                        "color": f"#{span.get('color', 0) & 0xffffff:06x}",
                    })
        elif block.get("type") == 1:
            x0, y0, x1, y1 = block["bbox"]
            if x1 > x0 and y1 > y0:
                elements.append({
                    "id": f"i-{bi}", "type": "image", "rect": [x0, y0, x1, y1],
                })
    # Basic native vector paths (lines and rectangles). Complex curves/clips
    # are intentionally not offered as editable because we cannot round-trip them.
    for vi, drawing in enumerate(page.get_drawings()):
        commands = drawing.get("items", [])
        if not commands or len(commands) > 20:
            continue
        if any(cmd[0] not in ("l", "re") for cmd in commands):
            continue
        box = fitz.Rect(drawing["rect"])
        if box.width < 0.5 or box.height < 0.5 or box.get_area() > page.rect.get_area() * 0.8:
            continue
        elements.append({
            "id": f"v-{vi}", "type": "shape",
            "rect": [box.x0, box.y0, box.x1, box.y1],
            "color": "#%02x%02x%02x" % tuple(int(c * 255) for c in (drawing.get("color") or (0, 0, 0))),
        })
    return elements


def _source_block(page: fitz.Page, element_id: str):
    parts = element_id.split("-")
    blocks = page.get_text("dict").get("blocks", [])
    try:
        if parts[0] == "t" and len(parts) == 4:
            block = blocks[int(parts[1])]
            span = block["lines"][int(parts[2])]["spans"][int(parts[3])]
            if block["type"] != 0:
                raise ValueError()
            return "text", span["bbox"], span
        if parts[0] == "v" and len(parts) == 2:
            drawing = page.get_drawings()[int(parts[1])]
            if not drawing.get("items") or any(item[0] not in ("l", "re") for item in drawing["items"]):
                raise ValueError()
            return "shape", drawing["rect"], drawing
        if parts[0] == "i" and len(parts) == 2:
            block = blocks[int(parts[1])]
            if block["type"] != 1:
                raise ValueError()
            return "image", block["bbox"], block
    except (ValueError, IndexError, KeyError, TypeError):
        pass
    raise HTTPException(400, f"Source element {element_id!r} no longer exists")


def _number(value, name: str, lo: float = 0, hi: float = 100000) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise HTTPException(400, f"Invalid {name}")
    if not lo <= value <= hi:
        raise HTTPException(400, f"{name} outside supported range")
    return float(value)


def _rgb(value: str) -> tuple[float, float, float]:
    if not isinstance(value, str) or len(value) != 7 or value[0] != "#":
        raise HTTPException(400, "Invalid text color")
    try:
        n = int(value[1:], 16)
    except ValueError as exc:
        raise HTTPException(400, "Invalid text color") from exc
    return ((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255)


def apply_source_edits(doc: fitz.Document, operations: list[dict]) -> None:
    """Apply source changes. The original page's structure is inspected before mutation."""
    if len(operations) > 1000:
        raise HTTPException(400, "Too many source edits")
    grouped: dict[int, list[dict]] = defaultdict(list)
    for item in operations:
        if not isinstance(item, dict) or item.get("type") != "source":
            raise HTTPException(400, "Invalid source edit")
        page = item.get("page")
        if type(page) is not int or not 0 <= page < doc.page_count:
            raise HTTPException(400, "Invalid page index")
        if item.get("action") not in ("replace", "move", "delete"):
            raise HTTPException(400, "Invalid source action")
        grouped[page].append(item)

    for index, changes in grouped.items():
        page = doc[index]
        # Snapshot the source blocks before redaction changes the content stream.
        prepared = []
        used = set()
        for change in changes:
            element_id = change.get("elementId")
            if not isinstance(element_id, str) or element_id in used:
                raise HTTPException(400, "Missing or duplicate source element ID")
            used.add(element_id)
            kind, coords, original = _source_block(page, element_id)
            original_rect = fitz.Rect(coords)
            if original_rect.is_empty:
                raise HTTPException(400, "Empty source element")
            action = change["action"]
            x = _number(change.get("x", original_rect.x0), "x")
            y = _number(change.get("y", original_rect.y0), "y")
            width = _number(change.get("width", original_rect.width), "width", 0.1)
            height = _number(change.get("height", original_rect.height), "height", 0.1)
            target = fitz.Rect(x, y, x + width, y + height)
            if not page.rect.contains(target):
                raise HTTPException(400, "Edited content must remain inside its page")
            if kind == "text":
                content = change.get("text", original["text"])
                if not isinstance(content, str) or len(content) > 10000:
                    raise HTTPException(400, "Invalid replacement text")
                family = change.get("font", "helvetica")
                if family not in FONT_NAMES:
                    raise HTTPException(400, "Unsupported font family")
                size = _number(change.get("size", original.get("size", 12)), "font size", 1, 180)
                bold = bool(change.get("bold", False))
                italic = bool(change.get("italic", False))
                font = FONT_NAMES[family][(1 if bold else 0) + (2 if italic else 0)]
                color = _rgb(change.get("color", "#000000"))
                prepared.append((kind, action, original_rect, target, content, font, size, color))
            elif kind == "shape":
                prepared.append((kind, action, original_rect, target, original, change.get("color")))
            else:
                prepared.append((kind, action, original_rect, target, original["image"]))

        # Operate on each region separately so text-only redaction doesn't remove images.
        for prepared_item in prepared:
            kind, action, source_rect, target, *data = prepared_item
            # A small additional border avoids leaving partial antialiased glyph edges.
            if kind == "shape":
                # Expand around strokes so a fully-covered vector path is removed.
                padding = max(6.0, float(data[0].get("width") or 1) * 5 + 1)
                expanded = fitz.Rect(source_rect.x0 - padding, source_rect.y0 - padding,
                                     source_rect.x1 + padding, source_rect.y1 + padding) & page.rect
                page.add_redact_annot(expanded, fill=None)
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                                      graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                                      text=fitz.PDF_REDACT_TEXT_NONE)
            else:
                page.add_redact_annot(source_rect, fill=(1, 1, 1))
                if kind == "image":
                    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE,
                                          graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                                          text=fitz.PDF_REDACT_TEXT_REMOVE)
                else:
                    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                                          graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                                          text=fitz.PDF_REDACT_TEXT_REMOVE)
            if action == "delete":
                continue
            if kind == "image":
                try:
                    page.insert_image(target, stream=data[0], keep_proportion=False, overlay=True)
                except Exception as exc:
                    raise HTTPException(400, "Could not reconstruct the selected image") from exc
                continue
            if kind == "shape":
                drawing, new_color = data
                source = fitz.Rect(drawing["rect"])
                if source.width < 0.01 or source.height < 0.01:
                    raise HTTPException(400, "Cannot resize degenerate vector path")
                sx, sy = target.width / source.width, target.height / source.height

                def point(p):
                    return fitz.Point(target.x0 + (p.x - source.x0) * sx,
                                      target.y0 + (p.y - source.y0) * sy)

                shape = page.new_shape()
                for command in drawing["items"]:
                    if command[0] == "re":
                        r = fitz.Rect(command[1])
                        shape.draw_rect(fitz.Rect(point(r.tl), point(r.br)))
                    elif command[0] == "l":
                        shape.draw_line(point(command[1]), point(command[2]))
                try:
                    stroke_color = _rgb(new_color) if new_color else drawing.get("color")
                    shape.finish(color=stroke_color, fill=drawing.get("fill"),
                                 width=float(drawing.get("width") or 1) * min(sx, sy))
                    shape.commit(overlay=True)
                except Exception as exc:
                    raise HTTPException(400, "Could not reconstruct selected vector shape") from exc
                continue
            content, font, size, color = data
            if not content:
                continue
            # PDF fonts and line breaks may differ from the source.
            # Fail rather than silently export missing replacement content.
            try:
                remaining = page.insert_textbox(target + (0, 0, 0, max(4, size * 0.5)),
                                                content, fontsize=size, fontname=font,
                                                color=color, overlay=True)
            except Exception as exc:
                raise HTTPException(400, "Replacement text contains unsupported glyphs") from exc
            if remaining < 0:
                raise HTTPException(422, "Replacement text does not fit in the selected box. Resize it or reduce the font size.")
