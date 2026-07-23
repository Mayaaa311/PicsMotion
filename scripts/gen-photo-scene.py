#!/usr/bin/env python3
"""Heuristic CPU layer separation for a real photograph (no AI / no API).

Splits a photo into a few depth layers using colour + position cues, keeping the
ORIGINAL pixels (we only compute an alpha mask per layer). An opaque full-frame
"plate" sits behind everything so parallax never exposes a hole — revealed
regions show the same original pixels. This is a stand-in for the Milestone 7 AI
pipeline, which will do true semantic separation.

Usage:
    python scripts/gen-photo-scene.py <source.jpg> <scene-id>
    # e.g. python scripts/gen-photo-scene.py apps/web/public/demo-photos/854.jpg yosemite-falls
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def feather(mask01: np.ndarray, radius: float) -> np.ndarray:
    """Feather a 0..1 mask by Gaussian-blurring its alpha."""
    a = Image.fromarray((np.clip(mask01, 0, 1) * 255).astype(np.uint8), mode="L")
    a = a.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(a).astype(float) / 255.0


def save_layer(rgb: np.ndarray, mask01: np.ndarray, path: str) -> None:
    h, w = mask01.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = rgb.astype(np.uint8)
    out[..., 3] = (np.clip(mask01, 0, 1) * 255).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(out, "RGBA").save(path)
    coverage = float((mask01 > 0.02).mean())
    print(f"  wrote {os.path.relpath(path, ROOT)}  coverage={coverage:.0%}")


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/demo-photos/854.jpg"
    scene_id = sys.argv[2] if len(sys.argv) > 2 else "yosemite-falls"
    out_dir = os.path.join(ROOT, "apps", "web", "public", "scenes", scene_id)

    img = Image.open(os.path.join(ROOT, src)).convert("RGB")
    W, H = img.size
    rgb = np.asarray(img).astype(float)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.299 * R + 0.587 * G + 0.114 * B
    mx = np.maximum(np.maximum(R, G), B)
    mn = np.minimum(np.minimum(R, G), B)
    sat = (mx - mn) / (mx + 1e-6)

    yy = np.linspace(0, 1, H).reshape(H, 1)
    xx = np.linspace(0, 1, W).reshape(1, W)

    print(f"Separating {src} ({W}x{H}) -> scenes/{scene_id}")

    # --- Foliage: green-dominant pines framing the scene -------------------
    foliage = ((G > R * 1.03) & (G > B * 1.02) & (G > 35) & (lum < 175)).astype(float)
    foliage = feather(foliage, radius=max(W, H) * 0.004)

    # --- Waterfall / bright low-saturation vertical column ------------------
    water = (
        (lum > 165)
        & (sat < 0.20)
        & (xx > 0.38)
        & (xx < 0.72)
        & (yy > 0.14)
        & (yy < 0.66)
    ).astype(float)
    water = feather(water, radius=max(W, H) * 0.006)

    # --- Foreground: the path / walls / people along the bottom ------------
    fg_band = np.clip((yy - 0.80) / 0.06, 0, 1) * np.ones((1, W))
    foreground = feather(fg_band, radius=max(W, H) * 0.006)

    # --- Plate: the whole original, opaque (safety net behind all) ---------
    plate = np.ones((H, W), dtype=float)

    save_layer(rgb, plate, os.path.join(out_dir, "layers", "plate.png"))
    save_layer(rgb, water, os.path.join(out_dir, "layers", "waterfall.png"))
    save_layer(rgb, foliage, os.path.join(out_dir, "layers", "foliage.png"))
    save_layer(rgb, foreground, os.path.join(out_dir, "layers", "foreground.png"))

    # Background plate + normalized copy + preview for packaging/inspection.
    Image.fromarray(rgb.astype(np.uint8), "RGB").save(os.path.join(out_dir, "background.png"))
    os.makedirs(os.path.join(out_dir, "original"), exist_ok=True)
    img.save(os.path.join(out_dir, "original", "normalized.png"))
    img.resize((max(1, W // 3), max(1, H // 3))).save(os.path.join(out_dir, "preview.png"))
    print(f"  wrote background.png, original/normalized.png, preview.png ({W}x{H})")
    print("Done.")


if __name__ == "__main__":
    main()
