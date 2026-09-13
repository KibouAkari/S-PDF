"""Vercel Python entrypoint — re-exports the FastAPI app for zero-config detection."""

from main import app

__all__ = ["app"]
