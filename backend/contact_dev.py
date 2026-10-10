"""Local Contact Us server without OCR models or background notification jobs.

Run from the project root: npm run start:contact
Use instead of the full backend; both use port 8000.
"""
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def create_app():
    # Match main.py: explicit environment variables take precedence over .env.
    env_file = Path(__file__).with_name(".env")
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))

    from contact_api import router

    app = FastAPI(title="WriteCheck local Contact Us")
    app.include_router(router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_methods=["POST"],
        allow_headers=["Content-Type"],
    )
    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(create_app(), host="127.0.0.1", port=8000)
