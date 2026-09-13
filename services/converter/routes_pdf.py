"""
Page-manipulation endpoints — the PyMuPDF equivalents of the Node/pdf-lib
routes in apps/api. These exist so the Python "converter" service can be the
sole backend on platforms (like Vercel) that only route /api/* to one service.

All endpoints operate in-memory (no temp files) since PyMuPDF can read/write
PDFs directly from/to bytes.
"""

import base64
import io
import json
import re
import zipfile

import fitz  # PyMuPDF
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

FONT_MAP = {
    (False, False): "helv",
    (True, False): "hebo",
    (False, True): "heit",
    (True, True): "hebi",
}


def _hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    h = (hex_str or "").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        val = int(h, 16)
    except ValueError:
        return (0.0, 0.0, 0.0)
    return (((val >> 16) & 255) / 255, ((val >> 8) & 255) / 255, (val & 255) / 255)


def _clamp(n, lo: float, hi: float) -> float:
    try:
        n = float(n)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, n))


def _parse_page_ranges(spec: str, page_count: int) -> list[int]:
    indices: set[int] = set()
    parts = [p.strip() for p in spec.split(",") if p.strip()]
    if not parts:
        raise HTTPException(400, "Page range cannot be empty")
    for part in parts:
        m = re.match(r"^(\d+)(?:-(\d+))?$", part)
        if not m:
            raise HTTPException(400, f'Invalid page range segment: "{part}"')
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else start
        if start < 1 or end < 1 or start > end:
            raise HTTPException(400, f'Invalid page range segment: "{part}"')
        for i in range(start, end + 1):
            if i > page_count:
                raise HTTPException(400, f"Page {i} is out of range (document has {page_count} pages)")
            indices.add(i - 1)
    return sorted(indices)


def _insert_rotated_text(page, x: float, y: float, text: str, size: float, color, opacity: float, angle_deg: float):
    point = fitz.Point(x, y)
    morph = (point, fitz.Matrix(angle_deg))
    page.insert_text(point, text, fontsize=size, fontname="hebo", color=color, fill_opacity=opacity, morph=morph)


@router.post("/info")
async def info(file: UploadFile = File(...)):
    doc = fitz.open(stream=await file.read(), filetype="pdf")
    pages = [{"width": p.rect.width, "height": p.rect.height, "rotation": p.rotation} for p in doc]
    result = {"pageCount": doc.page_count, "pages": pages}
    doc.close()
    return result


@router.post("/organize")
async def organize(files: list[UploadFile] = File(...), plan: str = Form(...)):
    if not files:
        raise HTTPException(400, "No files uploaded")
    try:
        plan_items = json.loads(plan)
    except json.JSONDecodeError:
        raise HTTPException(400, "`plan` must be valid JSON")
    if not isinstance(plan_items, list) or not plan_items:
        raise HTTPException(400, "`plan` must be a non-empty array")

    source_docs = [fitz.open(stream=await f.read(), filetype="pdf") for f in files]
    output = fitz.open()

    try:
        for item in plan_items:
            file_index = item.get("fileIndex")
            page_index = item.get("pageIndex")
            rotate = item.get("rotate") or 0
            if file_index is None or not (0 <= file_index < len(source_docs)):
                raise HTTPException(400, f"Invalid fileIndex {file_index} in plan")
            src = source_docs[file_index]
            if page_index is None or not (0 <= page_index < src.page_count):
                raise HTTPException(
                    400, f"Page {(page_index or 0) + 1} out of range for file #{file_index + 1} ({src.page_count} pages)"
                )
            output.insert_pdf(src, from_page=page_index, to_page=page_index)
            if rotate:
                new_page = output[-1]
                new_page.set_rotation((new_page.rotation + rotate) % 360)

        data = output.tobytes()
    finally:
        output.close()
        for d in source_docs:
            d.close()

    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="organized.pdf"'})


@router.post("/split")
async def split(file: UploadFile = File(...), ranges: str = Form(...)):
    spec = (ranges or "").strip()
    if not spec:
        raise HTTPException(400, "`ranges` is required")

    src = fitz.open(stream=await file.read(), filetype="pdf")
    groups = [g.strip() for g in spec.split(",") if g.strip()]

    buf = io.BytesIO()
    try:
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, group in enumerate(groups):
                indices = _parse_page_ranges(group, src.page_count)
                out = fitz.open()
                for idx in indices:
                    out.insert_pdf(src, from_page=idx, to_page=idx)
                zf.writestr(f"part-{i + 1}.pdf", out.tobytes())
                out.close()
    finally:
        src.close()

    return Response(content=buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="split.zip"'})


@router.post("/watermark")
async def watermark(
    file: UploadFile = File(...),
    text: str = Form(...),
    opacity: float = Form(0.25),
    fontSize: float = Form(48),
    color: str = Form("#94A3B8"),
    position: str = Form("center"),
    rotationDeg: float = Form(45),
):
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "`text` is required")

    opacity = _clamp(opacity, 0.02, 1)
    font_size = _clamp(fontSize, 6, 300)
    rgb = _hex_to_rgb(color)

    doc = fitz.open(stream=await file.read(), filetype="pdf")
    for page in doc:
        width, height = page.rect.width, page.rect.height
        text_width = fitz.get_text_length(text, fontname="hebo", fontsize=font_size)

        if position == "tile":
            step_x, step_y = text_width + 80, font_size + 80
            yy = -step_y
            while yy < height + step_y:
                xx = -step_x
                while xx < width + step_x:
                    _insert_rotated_text(page, xx, yy, text, font_size, rgb, opacity, rotationDeg)
                    xx += step_x
                yy += step_y
        else:
            _insert_rotated_text(page, width / 2 - text_width / 2, height / 2, text, font_size, rgb, opacity, rotationDeg)

    data = doc.tobytes()
    doc.close()
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="watermarked.pdf"'})


@router.post("/page-numbers")
async def page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-center"),
    startAt: int = Form(1),
    format: str = Form("{n}"),
    fontSize: float = Form(11),
):
    font_size = _clamp(fontSize, 6, 48)
    margin = 28

    doc = fitz.open(stream=await file.read(), filetype="pdf")
    total = doc.page_count
    for i, page in enumerate(doc):
        label = format.replace("{n}", str(startAt + i)).replace("{total}", str(total))
        width, height = page.rect.width, page.rect.height
        text_width = fitz.get_text_length(label, fontname="helv", fontsize=font_size)

        if position.endswith("left"):
            x = margin
        elif position.endswith("right"):
            x = width - text_width - margin
        else:
            x = width / 2 - text_width / 2
        y = margin if position.startswith("top") else height - margin + 4

        page.insert_text(fitz.Point(x, y), label, fontsize=font_size, fontname="helv", color=(0.25, 0.25, 0.25))

    data = doc.tobytes()
    doc.close()
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="numbered.pdf"'})


@router.post("/images-to-pdf")
async def images_to_pdf(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(400, "No images uploaded")

    PAGE_W, PAGE_H = 595.28, 841.89
    margin = 24

    doc = fitz.open()
    for f in files:
        pix = fitz.Pixmap(await f.read())
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)
        max_w, max_h = PAGE_W - margin * 2, PAGE_H - margin * 2
        scale = min(max_w / pix.width, max_h / pix.height, 1)
        w, h = pix.width * scale, pix.height * scale
        page = doc.new_page(width=PAGE_W, height=PAGE_H)
        rect = fitz.Rect((PAGE_W - w) / 2, (PAGE_H - h) / 2, (PAGE_W - w) / 2 + w, (PAGE_H - h) / 2 + h)
        page.insert_image(rect, pixmap=pix)

    data = doc.tobytes()
    doc.close()
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="images.pdf"'})


@router.post("/edit")
async def edit_pdf(file: UploadFile = File(...), objects: str = Form(...)):
    try:
        items = json.loads(objects)
    except json.JSONDecodeError:
        raise HTTPException(400, "`objects` must be valid JSON")
    if not isinstance(items, list):
        raise HTTPException(400, "`objects` must be an array")

    doc = fitz.open(stream=await file.read(), filetype="pdf")

    for obj in items:
        page_index = obj.get("page")
        if page_index is None or not (0 <= page_index < doc.page_count):
            raise HTTPException(400, f"Object references invalid page {page_index}")
        page = doc[page_index]
        page_height = page.rect.height
        obj_type = obj.get("type")

        # Incoming x/y use PDF's bottom-left origin (matching /api/pdf/info); flip to fitz's top-left space.
        if obj_type == "rect":
            x, y, w, h = obj["x"], obj["y"], obj["width"], obj["height"]
            top_y = page_height - (y + h)
            fill = _hex_to_rgb(obj.get("color", "#ffffff"))
            page.draw_rect(fitz.Rect(x, top_y, x + w, top_y + h), color=None, fill=fill)
        elif obj_type == "text":
            x, y = obj["x"], obj["y"]
            font = FONT_MAP[(bool(obj.get("bold")), bool(obj.get("italic")))]
            color = _hex_to_rgb(obj.get("color", "#000000"))
            page.insert_text(
                fitz.Point(x, page_height - y),
                obj.get("text", ""),
                fontsize=obj.get("size", 14),
                fontname=font,
                color=color,
            )
        elif obj_type == "image":
            x, y, w, h = obj["x"], obj["y"], obj["width"], obj["height"]
            top_y = page_height - (y + h)
            data_url = obj.get("dataUrl", "")
            b64 = data_url.split(",", 1)[1] if "," in data_url else ""
            page.insert_image(fitz.Rect(x, top_y, x + w, top_y + h), stream=base64.b64decode(b64))

    data = doc.tobytes()
    doc.close()
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="edited.pdf"'})
