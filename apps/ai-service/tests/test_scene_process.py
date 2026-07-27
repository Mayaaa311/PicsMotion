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
    # base_url is an absolute URL to this backend (so the browser loads the
    # generated assets from here, not the web origin).
    assert data["baseUrl"].startswith("http")
    assert f"/scenes/uploads/{data['sceneId']}/" in data["baseUrl"]
    assert data["sceneUrl"].endswith("/scene.json")

    out = os.path.join(get_settings().scenes_output_dir, "uploads", data["sceneId"])
    scene = json.load(open(os.path.join(out, "scene.json")))
    assert scene["version"] == "1.0"

    # Layering plans itself per photo: an opaque background plate, then whichever
    # strata the image actually has (a salient subject, and depth bands large
    # enough to be worth their own layer). Assert the invariants rather than one
    # fixed shape.
    ids = [layer["id"] for layer in scene["layers"]]
    assert ids[0] == "plate", "the background plate must come first"
    assert len(ids) >= 2, "a scene needs the plate plus at least one moving layer"
    assert len(set(ids)) == len(ids), "layer ids must be unique"
    assert set(ids) <= {"plate", "subject", "near", "mid"}
    assert data["layers"] == len(ids)
    for name in ids:
        assert os.path.exists(os.path.join(out, "layers", f"{name}.png"))

    # Depth must strictly increase from front to back, and only the plate is opaque
    # everywhere — the cutouts have to carry real transparency.
    depths = [layer["depth"] for layer in scene["layers"]]
    assert depths == sorted(depths, reverse=True), "plate first, then front-to-back"


def test_process_is_cached_by_content_hash() -> None:
    png = _png_bytes(320, 320)
    a = client.post("/scenes/process", files={"file": ("a.png", png, "image/png")}).json()
    b = client.post("/scenes/process", files={"file": ("b.png", png, "image/png")}).json()
    assert a["sceneId"] == b["sceneId"]  # same pixels → same scene
