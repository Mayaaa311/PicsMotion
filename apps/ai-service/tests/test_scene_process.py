"""Tests for the /scenes/process upload → CPU separation endpoint."""
from __future__ import annotations

import io
import json
import os

from fastapi.testclient import TestClient
from PIL import Image

from app.config import get_settings
from app.main import app

client = TestClient(app)


def _png_bytes(w: int = 400, h: int = 600) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (w, h), (90, 120, 160)).save(b, "PNG")
    return b.getvalue()


def test_process_rejects_non_image() -> None:
    r = client.post("/scenes/process", files={"file": ("x.txt", b"nope", "text/plain")})
    assert r.status_code == 400


def test_process_separates_and_writes_scene() -> None:
    r = client.post("/scenes/process", files={"file": ("photo.png", _png_bytes(), "image/png")})
    assert r.status_code == 200
    data = r.json()
    assert data["layers"] == 3
    assert data["baseUrl"].startswith("/scenes/uploads/")
    assert data["sceneUrl"].endswith("/scene.json")

    out = os.path.join(get_settings().scenes_output_dir, "uploads", data["sceneId"])
    scene = json.load(open(os.path.join(out, "scene.json")))
    assert scene["version"] == "1.0"
    assert [layer["id"] for layer in scene["layers"]] == ["plate", "mid", "near"]
    for name in ("plate", "mid", "near"):
        assert os.path.exists(os.path.join(out, "layers", f"{name}.png"))


def test_process_is_cached_by_content_hash() -> None:
    png = _png_bytes(320, 320)
    a = client.post("/scenes/process", files={"file": ("a.png", png, "image/png")}).json()
    b = client.post("/scenes/process", files={"file": ("b.png", png, "image/png")}).json()
    assert a["sceneId"] == b["sceneId"]  # same pixels → same scene
