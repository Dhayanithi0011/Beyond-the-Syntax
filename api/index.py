"""Vercel serverless entry for the FastAPI backend — single-project deployment.

In this layout ONE Vercel project serves both the static frontend
(frontend/dist, via ``vercel.json`` ``outputDirectory``) and the API. Vercel
rewrites every ``/api/*`` request to this function, and the function hands the
(fully preserved) path to the FastAPI app wrapped by Mangum, so FastAPI still
sees ``/api/v1/...`` exactly as it does locally.

The ``backend/`` directory is added to ``sys.path`` so ``app`` (the package
under ``backend/app``) imports as ``from app.main import app``.
"""
import os
import sys

_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from mangum import Mangum  # noqa: E402
from app.main import app  # noqa: E402

handler = Mangum(app)