"""
S-PDF converter microservice.

Handles the conversions that are impractical to do purely in Node:
- PDF -> Word (pdf2docx, pure Python, preserves layout as editable docx)
- Word -> PDF (delegates to LibreOffice headless, the de-facto free/open
  standard for high-fidelity Office conversion)
- PDF -> Images (PyMuPDF rasterization)
- PDF compression (PyMuPDF garbage collection + image downsampling)
"""

import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pdf2docx import Converter

from routes_pdf import router as pdf_router
from upload_limits import MAX_UPLOAD_BYTES, read_upload

logger = logging.getLogger(__name__)

app = FastAPI(title="S-PDF Converter Service")

app.add_middleware(
    CORSMiddleware,
    # This service is a public, unauthenticated API with no cookies/sessions,
    # so a wildcard origin carries no CSRF/credential-leak risk.
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    """Rejects oversized request bodies before they're buffered into memory."""
    content_length = request.headers.get("content-length")
    try:
        if content_length and int(content_length) > MAX_UPLOAD_BYTES:
            return JSONResponse(status_code=413, content={"error": "File too large"})
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid Content-Length"})
    return await call_next(request)


app.include_router(pdf_router)


def _soffice_path() -> str | None:
    return shutil.which("soffice") or shutil.which("libreoffice")


@app.get("/health")
@app.get("/api/health")
def health():
    available = bool(_soffice_path())
    return {"status": "ok", "libreoffice": available, "wordToPdf": "available" if available else "unavailable"}


@app.post("/api/convert/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Expected a PDF file")

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "input.pdf"
        docx_path = Path(tmp) / "output.docx"
        pdf_path.write_bytes(await read_upload(file))

        try:
            cv = Converter(str(pdf_path))
            cv.convert(str(docx_path))
            cv.close()
        except Exception as exc:  # noqa: BLE001
            logger.exception("PDF to Word conversion failed")
            raise HTTPException(422, "PDF to Word conversion failed. Check that the PDF is valid and not encrypted.") from exc

        if not docx_path.exists():
            raise HTTPException(500, "Conversion did not produce an output file")

        # Read into memory before the TemporaryDirectory is cleaned up on exit.
        data = docx_path.read_bytes()
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": 'attachment; filename="converted.docx"'},
        )


@app.post("/api/convert/word-to-pdf")
async def word_to_pdf(file: UploadFile = File(...)):
    """Convert DOC/DOCX in an isolated LibreOffice profile per request."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".doc", ".docx"):
        raise HTTPException(400, "Expected a .doc or .docx Word document")
    soffice = _soffice_path()
    if not soffice:
        raise HTTPException(
            503,
            "Word to PDF is unavailable: the server needs LibreOffice. "
            "Deploy the converter using the provided container image.",
        )

    with tempfile.TemporaryDirectory() as tmp:
        docx_path = Path(tmp) / f"input{suffix}"
        docx_path.write_bytes(await read_upload(file))
        profile = (Path(tmp) / "libreoffice-profile").as_uri()
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [
                    soffice,
                    f"-env:UserInstallation={profile}",
                    "--headless",
                    "--norestore",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    tmp,
                    str(docx_path),
                ],
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            logger.warning("LibreOffice conversion timed out")
            raise HTTPException(504, "Word conversion timed out. Try a smaller document.") from exc
        except OSError as exc:
            logger.exception("LibreOffice process failed to start")
            raise HTTPException(503, "Word conversion engine is unavailable.") from exc

        pdf_path = docx_path.with_suffix(".pdf")
        if result.returncode != 0 or not pdf_path.exists():
            logger.warning("LibreOffice conversion exited with code %s", result.returncode)
            raise HTTPException(422, "Word conversion failed. Check that the document is valid and not password protected.")

        data = pdf_path.read_bytes()
        if not data.startswith(b"%PDF-"):
            raise HTTPException(502, "Word converter returned an invalid PDF")
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="converted.pdf"'},
        )


@app.post("/api/convert/pdf-to-images")
async def pdf_to_images(file: UploadFile = File(...), dpi: int = Form(150)):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Expected a PDF file")
    dpi = max(36, min(600, dpi))

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "input.pdf"
        pdf_path.write_bytes(await read_upload(file))
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


@app.post("/api/convert/compress")
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
        pdf_path.write_bytes(await read_upload(file))

        try:
            doc = fitz.open(str(pdf_path))
            _downsample_images(doc, preset["max_dim"], preset["quality"])
            doc.save(str(out_path), garbage=4, deflate=True, clean=True)
            doc.close()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"Compression failed: {exc}") from exc

        optimized = out_path.read_bytes()
        original = pdf_path.read_bytes()
        # Re-encoding can expand already optimized PDFs. Never make them larger.
        data = optimized if len(optimized) < len(original) else original
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="compressed.pdf"'},
        )


def _downsample_images(doc: "fitz.Document", max_dim: int, quality: int) -> None:
    """Replace referenced opaque images via PyMuPDF's image API.

    update_stream(xref, jpeg_bytes) alone is invalid: the PDF image dictionary
    still declares the previous filter, width and height. replace_image updates
    the image object metadata and all references consistently.
    """
    processed: set[int] = set()
    for page in doc:
        for image in page.get_images(full=True):
            xref, smask = image[0], image[1]
            if xref in processed:
                continue
            processed.add(xref)
            if smask:  # Preserve transparent images and their soft masks.
                continue
            try:
                pix = fitz.Pixmap(doc, xref)
                if pix.alpha or max(pix.width, pix.height) <= max_dim:
                    continue
                if pix.n - pix.alpha >= 4:
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                scale = max_dim / max(pix.width, pix.height)
                small = fitz.Pixmap(
                    pix,
                    max(1, int(pix.width * scale)),
                    max(1, int(pix.height * scale)),
                    None,
                )
                jpeg = small.tobytes("jpg", jpg_quality=quality)
                page.replace_image(xref, stream=jpeg)
            except Exception:
                # Do not damage unsupported image objects; preserve originals.
                logger.exception("Skipping unsupported image during compression")
