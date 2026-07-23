#!/usr/bin/env python3
"""Generate the placeholder Soft Nature demo scene assets.

Produces full-frame, pixel-aligned RGBA layers so the runtime can stack them with
depth-aware parallax. These are procedural placeholders (not a real photograph);
the AI pipeline (Milestone 7) will later produce real layers. Deterministic
(seeded) so visual tests stay stable.

Usage:
    python scripts/gen-sample-scene.py
"""
from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image

W, H = 1600, 900
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "apps",
    "web",
    "public",
    "scenes",
    "soft-nature-demo",
)
RNG = np.random.default_rng(42)

# Coordinate grids, kept strictly 2D for clean broadcasting.
YY = np.linspace(0.0, 1.0, H).reshape(H, 1)  # (H, 1)
XX = np.linspace(0.0, 1.0, W).reshape(1, W)  # (1, W)


def _blank() -> np.ndarray:
    return np.zeros((H, W, 4), dtype=np.float64)


def _save(arr: np.ndarray, path: str) -> None:
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGBA")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print(f"  wrote {os.path.relpath(path, OUT)}  ({img.size[0]}x{img.size[1]})")


def _ridge(base_y: float, amp: float, freq: float, phase: float) -> np.ndarray:
    """Return a (1, W) row of normalized ridge y-positions per column."""
    xs = np.linspace(0.0, 1.0, W)
    line = base_y + amp * (
        0.6 * np.sin(2 * math.pi * freq * xs + phase)
        + 0.4 * np.sin(2 * math.pi * freq * 2.3 * xs + phase * 1.7)
    )
    return line.reshape(1, W)


def make_sky() -> np.ndarray:
    arr = _blank()
    top = (150.0, 205.0, 245.0)
    horizon = (255.0, 233.0, 199.0)
    t = YY ** 1.3  # (H,1)
    for c in range(3):
        arr[..., c] = top[c] * (1 - t) + horizon[c] * t
    # Soft sun glow, upper-right.
    d = np.sqrt((XX - 0.72) ** 2 + (YY - 0.28) ** 2)  # (H,W)
    glow = np.clip(1 - d / 0.5, 0, 1) ** 2
    for c, add in enumerate((60, 45, 20)):
        arr[..., c] += glow * add
    arr[..., 3] = 255
    return arr


def make_mountains() -> np.ndarray:
    arr = _blank()
    color = (120.0, 140.0, 170.0)
    line = _ridge(0.52, 0.06, 1.5, 1.0)  # (1,W)
    mask = YY >= line  # (H,W)
    shade = np.clip((YY - 0.5) * 1.5, 0, 1)  # (H,1)
    for c in range(3):
        arr[..., c] = color[c] * (1 - 0.25 * shade)
    arr[..., 3] = np.where(mask, 235, 0)
    return arr


def make_trees() -> np.ndarray:
    arr = _blank()
    color = (46.0, 82.0, 60.0)
    line = _ridge(0.66, 0.03, 3.0, 0.3)  # (1,W)
    mask = YY >= line
    for c in range(3):
        arr[..., c] = color[c]
    arr[..., 3] = np.where(mask, 245, 0)
    return arr


def make_subject_tree() -> np.ndarray:
    """A single prominent tree, left-of-center — the emotional focal point."""
    arr = _blank()
    trunk = (np.abs(XX - 0.36) < 0.012) & (YY > 0.55) & (YY < 0.82)  # (H,W)
    arr[trunk] = (92, 64, 40, 255)
    canopy = (54.0, 110.0, 66.0)
    for cx, cy, r in [(0.36, 0.44, 0.16), (0.28, 0.5, 0.11), (0.44, 0.5, 0.12), (0.36, 0.56, 0.12)]:
        b = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2) < r  # (H,W)
        n = int(b.sum())
        arr[b, 0] = canopy[0] + RNG.integers(-14, 14, size=n)
        arr[b, 1] = canopy[1] + RNG.integers(-16, 16, size=n)
        arr[b, 2] = canopy[2] + RNG.integers(-12, 12, size=n)
        arr[b, 3] = 255
    return arr


def make_grass() -> np.ndarray:
    """Foreground grass band along the bottom with blade texture and a soft top edge."""
    arr = _blank()
    top = 0.78
    band = YY >= top  # (H,1)
    base = (58.0, 96.0, 44.0)
    streak = (np.sin(XX * math.pi * 260) * 0.5 + 0.5) ** 2  # (1,W)
    for c in range(3):
        arr[..., c] = base[c] + streak * 18 - 9
    edge = np.clip((YY - top) / 0.03, 0, 1)  # (H,1)
    arr[..., 3] = np.where(band, 255 * edge, 0)
    return arr


def make_fog() -> np.ndarray:
    """Semi-transparent horizontal mist across the midground."""
    arr = _blank()
    band = np.exp(-((YY - 0.6) ** 2) / (2 * 0.05 ** 2))  # (H,1)
    noise = RNG.normal(0, 1, (H, W))
    kernel = np.ones(24) / 24
    noise = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode="same"), 1, noise)
    tex = np.clip(0.5 + noise * 0.5, 0, 1)  # (H,W)
    for c in range(3):
        arr[..., c] = 240
    arr[..., 3] = band * tex * 90
    return arr


def composite(layers: list[np.ndarray]) -> np.ndarray:
    """Alpha-over composite (back to front) onto an opaque output."""
    out = _blank()
    out[..., 3] = 255
    for layer in layers:
        a = layer[..., 3:4] / 255.0
        out[..., :3] = layer[..., :3] * a + out[..., :3] * (1 - a)
    out[..., 3] = 255
    return out


def main() -> None:
    print(f"Generating Soft Nature demo assets into {OUT}")
    sky = make_sky()
    mountains = make_mountains()
    trees = make_trees()
    subject = make_subject_tree()
    grass = make_grass()
    fog = make_fog()

    _save(sky, os.path.join(OUT, "layers", "sky.png"))
    _save(mountains, os.path.join(OUT, "layers", "mountains.png"))
    _save(trees, os.path.join(OUT, "layers", "trees.png"))
    _save(fog, os.path.join(OUT, "layers", "fog.png"))
    _save(subject, os.path.join(OUT, "layers", "subject-tree.png"))
    _save(grass, os.path.join(OUT, "layers", "grass.png"))

    background = composite([sky, mountains, trees])
    _save(background, os.path.join(OUT, "background.png"))

    full = composite([sky, mountains, trees, fog, subject, grass])
    _save(full, os.path.join(OUT, "original", "normalized.png"))

    preview = Image.fromarray(np.clip(full, 0, 255).astype(np.uint8), "RGBA").resize((480, 270))
    prev_path = os.path.join(OUT, "preview.png")
    preview.save(prev_path)
    print(f"  wrote {os.path.relpath(prev_path, OUT)}  (480x270)")
    print("Done.")


if __name__ == "__main__":
    main()
