"""
wsgi.py — entry point for WSGI-only hosting (e.g. PythonAnywhere's standard
web apps), which serve a synchronous WSGI callable, not the ASGI app FastAPI
produces. a2wsgi bridges the two.

Not used for local dev or any host that runs an ASGI server directly
(uvicorn, Render, a VPS) — those import `app` from main.py as normal.

PythonAnywhere's WSGI server does not run FastAPI's ASGI lifespan protocol,
so main.py's startup hook (which calls init_db()) never fires under it —
init_db() is called directly here instead, before the app is wrapped.
"""
import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from database import init_db

init_db()

from a2wsgi import ASGIMiddleware
from main import app as _asgi_app

application = ASGIMiddleware(_asgi_app)
