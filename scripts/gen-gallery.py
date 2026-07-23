#!/usr/bin/env python3
"""Batch-separate the demo photos into interactive scenes (universal, CPU-only).

For EVERY photo in apps/web/public/demo-photos it produces a 3-layer depth scene:
  * near  (bottom band)   — moves most
  * mid   (middle band)   — moves some
  * plate (reconstructed background, with near+mid removed and inpainted)

This is a generic depth-from-vertical-position separation that works on any image
(no per-photo tuning). It is NOT object-accurate — true per-object separation is
the Milestone 7 AI pipeline. But it lets you pick any photo and apply the presets
and art styles. Writes:
  apps/web/public/scenes/gallery/<id>/{scene.json,layers/*.png,background.png,preview.png}
  apps/web/public/scenes/gallery/index.json  (the picker reads this)

Usage: python scripts/gen-gallery.py
"""
from __future__ import annotations

import json
import os

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "apps", "web", "public", "demo-photos")
OUT_DIR = os.path.join(ROOT, "apps", "web", "public", "scenes", "gallery")
MAX_SIDE = 1600  # cap texture size for performance


def feather(mask01: np.ndarray, radius: float) -> np.ndarray:
    a = Image.fromarray((np.clip(mask01, 0, 1) * 255).astype(np.uint8), "L")
    return np.asarray(a.filter(ImageFilter.GaussianBlur(radius))).astype(float) / 255.0


def save_rgba(rgb: np.ndarray, alpha01: np.ndarray, path: str) -> None:
    h, w = alpha01.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = (np.clip(alpha01, 0, 1) * 255).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(out, "RGBA").save(path)


def layer(layer_id: str, name: str, role: str, depth: float, parallax: float, max_off: float) -> dict:
    return {
        "id": layer_id,
        "name": name,
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
        "audioSensitivity": {"bass": 0.15, "lowMid": 0.1, "highMid": 0.05, "treble": 0.05, "beat": 0.1, "loudness": 0.15},
        "importance": 0.5,
        "locked": role == "background",
        "revealBudget": {"maxOffsetX": max_off + 0.01, "maxOffsetY": max_off, "confidence": 0.6},
        "provenance": (
            {"visiblePixels": "mixed", "sourceImageHash": "gallery", "completionProvider": "opencv-telea-cpu"}
            if role == "background"
            else {"visiblePixels": "original", "sourceImageHash": "gallery"}
        ),
    }


def build_scene(src_path: str, scene_id: str, title: str) -> dict:
    img = Image.open(src_path).convert("RGB")
    if max(img.size) > MAX_SIDE:
        s = MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * s), round(img.height * s)))
    W, H = img.size
    rgb = np.asarray(img).astype(float)
    yy = np.linspace(0, 1, H).reshape(H, 1) * np.ones((1, W))

    diag = max(W, H)
    near_core = yy > 0.70
    mid_core = (yy > 0.42) & (yy < 0.75)
    near = feather(near_core.astype(float), diag * 0.006)
    mid = feather(mid_core.astype(float), diag * 0.01)

    union = ((near_core | mid_core).astype(np.uint8)) * 255
    k = max(3, int(diag * 0.012)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    gen_mask = cv2.dilate(union, kernel, 1)
    bgr = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    plate = cv2.cvtColor(
        cv2.inpaint(bgr, gen_mask, max(4, int(diag * 0.01)), cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB
    ).astype(float)

    out = os.path.join(OUT_DIR, scene_id)
    save_rgba(plate, np.ones((H, W)), os.path.join(out, "layers", "plate.png"))
    save_rgba(rgb, mid, os.path.join(out, "layers", "mid.png"))
    save_rgba(rgb, near, os.path.join(out, "layers", "near.png"))
    Image.fromarray(plate.astype(np.uint8), "RGB").save(os.path.join(out, "background.png"))
    img.resize((max(1, W // 4), max(1, H // 4))).save(os.path.join(out, "preview.png"))

    scene = {
        "version": "1.0",
        "id": scene_id,
        "title": title,
        "width": W,
        "height": H,
        "aspectRatio": round(W / H, 4),
        "originalImageUrl": "background.png",
        "backgroundPlateUrl": "background.png",
        "preset": "soft-nature",
        "visualAnalysis": {"sceneType": "photo", "mainSubject": title},
        "layers": [
            layer("plate", "Background", "background", 0.9, 0.05, 0.02),
            layer("mid", "Midground", "midground", 0.5, 0.18, 0.035),
            layer("near", "Foreground", "foreground", 0.14, 0.4, 0.05),
        ],
        "atmosphere": {"vignette": 0.05},
        "camera": {"fov": 45, "parallaxStrength": 0.16, "driftStrength": 0.02},
        "audioBindings": [
            {"source": "bass", "target": "camera.zoom", "scale": 0.22, "offset": 0, "smoothing": 0.2, "clamp": [0, 0.28], "curve": "easeOut"},
        ],
        "metadata": {"createdAt": "2026-07-23T00:00:00Z", "pipelineVersion": "0.1.0-gallery-cpu"},
    }
    with open(os.path.join(out, "scene.json"), "w") as f:
        json.dump(scene, f, indent=2)
    return {"id": scene_id, "title": title, "preview": f"gallery/{scene_id}/preview.png", "aspect": scene["aspectRatio"]}


def main() -> None:
    manifest_path = os.path.join(SRC_DIR, "manifest.json")
    photos = json.load(open(manifest_path))["photos"] if os.path.exists(manifest_path) else [
        {"file": f} for f in sorted(os.listdir(SRC_DIR)) if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]
    index = []
    print(f"Separating {len(photos)} photos -> scenes/gallery/")
    for p in photos:
        f = p["file"]
        scene_id = os.path.splitext(f)[0]
        title = f"Photo {scene_id}"
        try:
            index.append(build_scene(os.path.join(SRC_DIR, f), scene_id, title))
            print(f"  ok  {scene_id}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL {scene_id}: {exc}")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "index.json"), "w") as f:
        json.dump({"scenes": index}, f, indent=2)
    print(f"Wrote {len(index)} scenes + index.json")


if __name__ == "__main__":
    main()
