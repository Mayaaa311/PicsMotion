#!/usr/bin/env python3
"""Heuristic CPU layer separation + background reconstruction (no AI / no API).

Splits a photo into depth layers using colour + position cues, then RECONSTRUCTS
the background so it does NOT contain the extracted objects: the union of all
object masks is dilated into a "generation mask" and filled with OpenCV
inpainting. This mirrors the Milestone 7 rule — "reconstruct the background
hidden behind extracted objects" — using classical CV instead of a generative
model (which is imperfect for large regions; generative inpainting is M7).

Two-mask strategy (spec §17.10):
  * generation mask  — dilated union of objects; the region we inpaint.
  * composite mask   — per-object feathered mask; controls the cutout's alpha.

Extracted-object layers keep the ORIGINAL pixels. Only the background plate
contains generated (inpainted) pixels.

Usage:
    python scripts/gen-photo-scene.py <source.jpg> <scene-id>
"""
from __future__ import annotations

import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def feather(mask01: np.ndarray, radius: float) -> np.ndarray:
    a = Image.fromarray((np.clip(mask01, 0, 1) * 255).astype(np.uint8), mode="L")
    a = a.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(a).astype(float) / 255.0


def save_layer(rgb: np.ndarray, mask01: np.ndarray, path: str) -> None:
    h, w = mask01.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = (np.clip(mask01, 0, 1) * 255).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(out, "RGBA").save(path)
    print(f"  wrote {os.path.relpath(path, ROOT)}  coverage={float((mask01 > 0.02).mean()):.0%}")


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
    diag = max(W, H)

    print(f"Separating {src} ({W}x{H}) -> scenes/{scene_id}")

    # --- Object masks (boolean cores) --------------------------------------
    foliage_core = (G > R * 1.03) & (G > B * 1.02) & (G > 35) & (lum < 175)
    water_core = (
        (lum > 165) & (sat < 0.20)
        & (xx > 0.38) & (xx < 0.72) & (yy > 0.14) & (yy < 0.66)
    )
    fg_core = (yy > 0.82) * np.ones((1, W), dtype=bool)

    # Composite (feathered) masks → alpha for each extracted layer's cutout.
    foliage = feather(foliage_core.astype(float), diag * 0.004)
    water = feather(water_core.astype(float), diag * 0.006)
    foreground = feather(np.clip((yy - 0.80) / 0.06, 0, 1) * np.ones((1, W)), diag * 0.006)

    # --- Background reconstruction -----------------------------------------
    # generation mask = dilated union of all extracted objects (removes halos too).
    union = (foliage_core | water_core | fg_core).astype(np.uint8) * 255
    k = max(3, int(diag * 0.012)) | 1  # odd kernel size
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    gen_mask = cv2.dilate(union, kernel, iterations=1)

    bgr = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    inpaint_radius = max(4, int(diag * 0.01))
    filled_bgr = cv2.inpaint(bgr, gen_mask, inpaint_radius, cv2.INPAINT_TELEA)
    background = cv2.cvtColor(filled_bgr, cv2.COLOR_BGR2RGB).astype(float)
    removed = float((gen_mask > 0).mean())
    print(f"  reconstructed background: removed+inpainted {removed:.0%} of the frame")

    # --- Write layers -------------------------------------------------------
    # Plate = the OBJECT-FREE reconstructed background (opaque).
    save_layer(background, np.ones((H, W)), os.path.join(out_dir, "layers", "plate.png"))
    # Extracted objects keep ORIGINAL pixels.
    save_layer(rgb, water, os.path.join(out_dir, "layers", "waterfall.png"))
    save_layer(rgb, foliage, os.path.join(out_dir, "layers", "foliage.png"))
    save_layer(rgb, foreground, os.path.join(out_dir, "layers", "foreground.png"))

    # Packaging artefacts.
    Image.fromarray(np.clip(background, 0, 255).astype(np.uint8), "RGB").save(
        os.path.join(out_dir, "background.png")
    )
    os.makedirs(os.path.join(out_dir, "original"), exist_ok=True)
    img.save(os.path.join(out_dir, "original", "normalized.png"))
    os.makedirs(os.path.join(out_dir, "masks"), exist_ok=True)
    Image.fromarray(gen_mask, "L").save(os.path.join(out_dir, "masks", "generation.png"))
    img.resize((max(1, W // 3), max(1, H // 3))).save(os.path.join(out_dir, "preview.png"))
    print("  wrote background.png, original/normalized.png, masks/generation.png, preview.png")
    print("Done.")


if __name__ == "__main__":
    main()
