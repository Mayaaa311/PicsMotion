"""Universal CPU layer separation for an uploaded/chosen photo (no AI, no keys).

Depth-from-vertical-position heuristic: split into near / mid / plate bands with a
reconstructed (inpainted) background so parallax never reveals a ghost of the
extracted foreground. Not object-accurate — that is the AI pipeline — but works on
any photo and yields an interactive 2.5D scene the presets/styles can drive.

Writes a scene package to <out_dir> and returns the scene dict.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageFilter

MAX_SIDE = 1600


def image_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def _feather(mask01: np.ndarray, radius: float) -> np.ndarray:
    a = Image.fromarray((np.clip(mask01, 0, 1) * 255).astype(np.uint8), "L")
    return np.asarray(a.filter(ImageFilter.GaussianBlur(radius))).astype(float) / 255.0


def _save_rgba(rgb: np.ndarray, alpha01: np.ndarray, path: str) -> None:
    h, w = alpha01.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = (np.clip(alpha01, 0, 1) * 255).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(out, "RGBA").save(path)


def _layer(
    layer_id: str, role: str, depth: float, parallax: float, max_off: float
) -> dict[str, Any]:
    return {
        "id": layer_id,
        "name": layer_id.capitalize(),
        "semanticLabel": role,
        "role": role,
        "assetUrl": f"layers/{layer_id}.png",
        "bounds": {"x": 0, "y": 0, "width": 1, "height": 1},
        "anchor": {"x": 0.5, "y": 0.5},
        "depth": depth,
        "depthVariance": 0.1,
        "baseScale": 1.06,
        "baseRotation": 0,
        "baseOpacity": 1,
        "movement": {
            "enabled": True,
            "maxOffsetX": max_off,
            "maxOffsetY": max_off * 0.6,
            "maxOffsetZ": 0,
            "maxRotation": 0,
            "parallaxStrength": parallax,
            "dragEnabled": False,
            "returnMode": "spring",
        },
        "interactionTags": [],
        "materialTags": ["photo"],
        "audioSensitivity": {
            "bass": 0.15,
            "lowMid": 0.1,
            "highMid": 0.05,
            "treble": 0.05,
            "beat": 0.1,
            "loudness": 0.15,
        },
        "importance": 0.5,
        "locked": role == "background",
        "revealBudget": {"maxOffsetX": max_off + 0.01, "maxOffsetY": max_off, "confidence": 0.6},
        "provenance": (
            {
                "visiblePixels": "mixed",
                "sourceImageHash": "upload",
                "completionProvider": "opencv-telea-cpu",
            }
            if role == "background"
            else {"visiblePixels": "original", "sourceImageHash": "upload"}
        ),
    }


def separate_image(data: bytes, out_dir: str, scene_id: str, title: str) -> dict[str, Any]:
    """Separate `data` (image bytes) into a 3-layer scene written under out_dir."""
    from io import BytesIO

    img = Image.open(BytesIO(data)).convert("RGB")
    if max(img.size) > MAX_SIDE:
        s = MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * s), round(img.height * s)))
    w, h = img.size
    rgb = np.asarray(img).astype(float)
    yy = np.linspace(0, 1, h).reshape(h, 1) * np.ones((1, w))
    diag = max(w, h)

    near_core = yy > 0.70
    mid_core = (yy > 0.42) & (yy < 0.75)
    near = _feather(near_core.astype(float), diag * 0.006)
    mid = _feather(mid_core.astype(float), diag * 0.01)

    union = ((near_core | mid_core).astype(np.uint8)) * 255
    k = max(3, int(diag * 0.012)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    gen_mask = cv2.dilate(union, kernel, iterations=1)
    bgr = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    plate = cv2.cvtColor(
        cv2.inpaint(bgr, gen_mask, max(4, int(diag * 0.01)), cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB
    ).astype(float)

    _save_rgba(plate, np.ones((h, w)), os.path.join(out_dir, "layers", "plate.png"))
    _save_rgba(rgb, mid, os.path.join(out_dir, "layers", "mid.png"))
    _save_rgba(rgb, near, os.path.join(out_dir, "layers", "near.png"))
    Image.fromarray(plate.astype(np.uint8), "RGB").save(os.path.join(out_dir, "background.png"))
    img.resize((max(1, w // 4), max(1, h // 4))).save(os.path.join(out_dir, "preview.png"))

    scene = {
        "version": "1.0",
        "id": scene_id,
        "title": title,
        "width": w,
        "height": h,
        "aspectRatio": round(w / h, 4),
        "originalImageUrl": "background.png",
        "backgroundPlateUrl": "background.png",
        "preset": "soft-nature",
        "visualAnalysis": {"sceneType": "photo", "mainSubject": title},
        "layers": [
            _layer("plate", "background", 0.9, 0.05, 0.02),
            _layer("mid", "midground", 0.5, 0.18, 0.035),
            _layer("near", "foreground", 0.14, 0.4, 0.05),
        ],
        "atmosphere": {"vignette": 0.05},
        "camera": {"fov": 45, "parallaxStrength": 0.16, "driftStrength": 0.02},
        "audioBindings": [
            {
                "source": "bass",
                "target": "camera.zoom",
                "scale": 0.22,
                "offset": 0,
                "smoothing": 0.2,
                "clamp": [0, 0.28],
                "curve": "easeOut",
            },
        ],
        "metadata": {"createdAt": "2026-07-23T00:00:00Z", "pipelineVersion": "0.1.0-upload-cpu"},
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "scene.json"), "w") as f:
        json.dump(scene, f, indent=2)
    return scene
