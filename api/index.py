"""Vercel serverless entry for the FastAPI backend — single-project deployment.

Vercel's current Python runtime auto-detects FastAPI here (``app`` exported from
``api/index.py`` + fastapi in ``requirements.txt``) and serves the WHOLE project
from this one function, mounting it under ``/api``. That means:

- requests to ``/api/v1/...`` arrive at FastAPI with the ``/api`` prefix
  stripped (the app sees ``/v1/...``), and
- non-API paths (``/``, SPA routes, ...) also land here, not on static files.

So this module:

1. normalizes the request path so FastAPI always sees the full ``/api/v1/...``
   it was registered with (works whether Vercel strips the prefix or not), and
2. serves the built React app (``frontend/dist``) for every non-API path, so
   the site and API share this single function on one origin.
"""
import os
import sys

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from fastapi import HTTPException  # noqa: E402

from app.main import app  # noqa: E402


@app.middleware("http")
async def normalize_path(request, call_next):
    """Rewrite ``/v1/...`` back to ``/api/v1/...`` (Vercel strips the mount prefix)."""
    scope = request.scope
    path = scope.get("path", "")
    if not path.startswith("/api") and (path == "/v1" or path.startswith("/v1/")):
        scope["path"] = "/api" + path
        scope["raw_path"] = ("/api" + path).encode("utf-8")
    return await call_next(request)


_DIST = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"))
_INDEX = os.path.join(_DIST, "index.html")

if os.path.isfile(_INDEX):
    _ASSETS = os.path.join(_DIST, "assets")
    if os.path.isdir(_ASSETS):
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="spa-assets")

    @app.get("/", include_in_schema=False)
    async def spa_root():
        return FileResponse(_INDEX)

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa_fallback(full_path: str):
        if (
            not full_path
            or full_path.startswith((".", "api", "v1", "ws", "admin"))
            or ".." in full_path.split("/")
        ):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = os.path.join(_DIST, full_path)
        if not full_path.endswith("/") and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_INDEX)


from mangum import Mangum  # noqa: E402

handler = Mangum(app)