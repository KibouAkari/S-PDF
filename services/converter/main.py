"""
S-PDF converter microservice.

Handles the conversions that are impractical to do purely in Node:
- PDF -> Word (pdf2docx, pure Python, preserves layout as editable docx)
- Word -> PDF (delegates to LibreOffice headless, the de-facto free/open
  standard for high-fidelity Office conversion)
- PDF -> Images (PyMuPDF rasterization)
- PDF compression (PyMuPDF garbage collection + image downsampling)
"""

import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pdf2docx import Converter

app = FastAPI(title="S-PDF Converter Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # only reachable from the trusted API service, not the public internet
    allow_methods=["POST"],
    allow_headers=["*"],
)


def _soffice_path() -> str | None:
    return shutil.which("soffice") or shutil.which("libreoffice")


@app.get("/health")
def health():
    return {"status": "ok", "libreoffice": bool(_soffice_path())}


@app.post("/convert/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Expected a PDF file")

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "input.pdf"
        docx_path = Path(tmp) / "output.docx"
        pdf_path.write_bytes(await file.read())

        try:
            cv = Converter(str(pdf_path))
            cv.convert(str(docx_path))
            cv.close()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"PDF to Word conversion failed: {exc}") from exc

        if not docx_path.exists():
            raise HTTPException(500, "Conversion did not produce an output file")

        # Read into memory before the TemporaryDirectory is cleaned up on exit.
        data = docx_path.read_bytes()
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": 'attachment; filename="converted.docx"'},
        )


@app.post("/convert/word-to-pdf")
async def word_to_pdf(file: UploadFile = File(...)):
    soffice = _soffice_path()
    if not soffice:
        raise HTTPException(
            503,
            "Word to PDF conversion requires LibreOffice (soffice) to be installed on the server.",
        )

    with tempfile.TemporaryDirectory() as tmp:
        suffix = Path(file.filename or "input.docx").suffix or ".docx"
        docx_path = Path(tmp) / f"input{suffix}"
        docx_path.write_bytes(await file.read())

        result = subprocess.run(
            [soffice, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", tmp, str(docx_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        pdf_path = docx_path.with_suffix(".pdf")
        if result.returncode != 0 or not pdf_path.exists():
            raise HTTPException(500, f"LibreOffice conversion failed: {result.stderr or result.stdout}")

        data = pdf_path.read_bytes()
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="converted.pdf"'},
        )


@app.post("/convert/pdf-to-images")
async def pdf_to_images(file: UploadFile = File(...), dpi: int = Form(150)):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Expected a PDF file")
    dpi = max(36, min(600, dpi))

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "input.pdf"
        pdf_path.write_bytes(await file.read())
        zip_path = Path(tmp) / "pages.zip"

        try:
            doc = fitz.open(str(pdf_path))
            zoom = dpi / 72
            matrix = fitz.Matrix(zoom, zoom)
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for i, page in enumerate(doc):
                    pix = page.get_pixmap(matrix=matrix)
                    img_bytes = pix.tobytes("png")
                    zf.writestr(f"page-{i + 1}.png", img_bytes)
            doc.close()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"Rasterization failed: {exc}") from exc

        data = zip_path.read_bytes()
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="pages.zip"'},
        )


@app.post("/convert/compress")
async def compress(file: UploadFile = File(...), level: str = Form("medium")):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Expected a PDF file")

    # Target max dimension / JPEG quality per compression level.
    presets = {
        "low": {"max_dim": 2000, "quality": 85},
        "medium": {"max_dim": 1400, "quality": 70},
        "high": {"max_dim": 1000, "quality": 45},
    }
    preset = presets.get(level, presets["medium"])

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "input.pdf"
        out_path = Path(tmp) / "output.pdf"
        pdf_path.write_bytes(await file.read())

        try:
            doc = fitz.open(str(pdf_path))
            _downsample_images(doc, preset["max_dim"], preset["quality"])
            doc.save(str(out_path), garbage=4, deflate=True, clean=True)
            doc.close()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"Compression failed: {exc}") from exc

        data = out_path.read_bytes()
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="compressed.pdf"'},
        )


def _downsample_images(doc: "fitz.Document", max_dim: int, quality: int) -> None:
    """Re-encodes oversized embedded images as JPEG to shrink file size."""
    for xref in range(1, doc.xref_length()):
        try:
            info = doc.extract_image(xref)
        except Exception:  # noqa: BLE001
            continue
        if not info:
            continue
        width, height = info.get("width", 0), info.get("height", 0)
        if not width or not height or max(width, height) <= max_dim:
            continue
        try:
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha >= 4:  # CMYK -> RGB
                pix = fitz.Pixmap(fitz.csRGB, pix)
            scale = max_dim / max(width, height)
            pix = fitz.Pixmap(pix, int(width * scale), int(height * scale), None)
            doc.update_stream(xref, pix.tobytes("jpg", jpg_quality=quality))
        except Exception:  # noqa: BLE001
            continue
