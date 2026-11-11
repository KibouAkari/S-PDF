"""Bound actual uploaded file bytes, including requests without Content-Length.

Starlette parses multipart bodies before endpoint invocation; the reverse proxy
must additionally cap total request bytes and concurrent requests in production.
"""
import os

from fastapi import HTTPException, UploadFile

MAX_UPLOAD_BYTES = max(1, int(os.environ.get("MAX_UPLOAD_MB", "100"))) * 1024 * 1024


async def read_upload(file: UploadFile, *, max_bytes: int | None = None) -> bytes:
    limit = MAX_UPLOAD_BYTES if max_bytes is None else min(MAX_UPLOAD_BYTES, max_bytes)
    if limit < 1:
        raise HTTPException(413, "Total upload size exceeded")
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, "File or total upload size exceeded")
    return data
