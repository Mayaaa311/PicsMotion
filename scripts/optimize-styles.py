#!/usr/bin/env python3
"""Compress generated style frames to WebP for a lean web deploy.

The GPT ``gpt-image-1`` styles land as multi-MB PNGs -- ~700 MB across the
gallery, far too large to commit for a static Vercel deploy. WebP cuts that
~10x with no visible loss for a brush reveal. Each ``styles/<id>.png`` becomes
``styles/<id>.webp`` (the runtime loads ``.webp``); the source PNG stays on disk
(git-ignored) so the style cache and any re-run are untouched.

  pixel-art -> LOSSLESS webp   (keeps crisp indexed pixels)
  everything else -> lossy q=82 (painterly styles; webp holds hard edges well)

Idempotent: a style is skipped when its ``.webp`` is newer than its ``.png``.

Usage:
    python scripts/optimize-styles.py                  # yosemite + gallery (index)
    python scripts/optimize-styles.py <sceneDir> ...   # specific scene folders
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCENES = ROOT / "apps" / "web" / "public" / "scenes"
GALLERY = SCENES / "gallery"

#: Styles kept lossless so their defining detail survives compression.
_LOSSLESS = {"pixel-art"}
_LOSSY_QUALITY = 82


def _default_scene_dirs() -> list[Path]:
    """Every gallery scene in the index that has styles (yosemite included)."""
    dirs: list[Path] = []
    index_path = GALLERY / "index.json"
    if index_path.is_file():
        index = json.loads(index_path.read_text(encoding="utf-8"))
        for item in index.get("scenes", []):
            scene_dir = GALLERY / item["id"]
            if (scene_dir / "styles").is_dir():
                dirs.append(scene_dir)
    return dirs


def _convert(png: Path) -> tuple[int, int]:
    """Write ``<name>.webp`` beside ``png``. Returns (png_bytes, webp_bytes)."""
    webp = png.with_suffix(".webp")
    png_size = png.stat().st_size
    if webp.is_file() and webp.stat().st_mtime >= png.stat().st_mtime:
        return png_size, webp.stat().st_size
    image = Image.open(png)
    if png.stem in _LOSSLESS:
        image.save(webp, format="WEBP", lossless=True, method=6)
    else:
        image.save(webp, format="WEBP", quality=_LOSSY_QUALITY, method=6)
    return png_size, webp.stat().st_size


def optimize_scene(scene_dir: Path) -> tuple[int, int]:
    styles = scene_dir / "styles"
    total_png = total_webp = 0
    for png in sorted(styles.glob("*.png")):
        png_bytes, webp_bytes = _convert(png)
        total_png += png_bytes
        total_webp += webp_bytes
    mb = 1024 * 1024
    print(
        f"  {scene_dir.name}: {total_png / mb:6.1f} MB PNG -> "
        f"{total_webp / mb:5.1f} MB WebP"
    )
    return total_png, total_webp


def main(argv: list[str]) -> int:
    scene_dirs = [Path(a) for a in argv] if argv else _default_scene_dirs()
    if not scene_dirs:
        print("No scenes with styles found.")
        return 1
    print(f"Optimizing styles in {len(scene_dirs)} scene(s) -> WebP")
    grand_png = grand_webp = 0
    for scene_dir in scene_dirs:
        png_bytes, webp_bytes = optimize_scene(scene_dir)
        grand_png += png_bytes
        grand_webp += webp_bytes
    mb = 1024 * 1024
    saved = grand_png - grand_webp
    print(
        f"Total: {grand_png / mb:.1f} MB PNG -> {grand_webp / mb:.1f} MB WebP "
        f"(saved {saved / mb:.1f} MB, {saved / grand_png * 100:.0f}%)"
        if grand_png
        else "Nothing to do."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
