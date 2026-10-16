"""Loopback-only browser app and health endpoint."""

from __future__ import annotations

from importlib.metadata import version
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

app = FastAPI(title="Stellis", docs_url=None, redoc_url=None)
_STATIC = Path(__file__).parent / "static"


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a small readiness response for a clean install check."""
    return {"status": "ok", "mode": "local", "version": version("stellis")}


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """Serve the browser workspace shell."""
    return FileResponse(_STATIC / "index.html")
