#!/usr/bin/env python3
"""Batch-separate the demo photos into interactive scenes (universal, CPU-only).

Delegates to :func:`app.separate.separate_image` so the gallery, photo uploads and
the ``/scenes/process`` endpoint all share ONE separation implementation — there
is no second copy of the layering logic to drift out of sync.

Each photo becomes a 3-layer depth scene (plate / mid / near) whose cutouts keep
original pixels and whose background plate is the original photo with only the
parallax-revealable band reconstructed. Writes:
  apps/web/public/scenes/gallery/<id>/{scene.json,layers/*.png,background.png,...}
  apps/web/public/scenes/gallery/index.json  (the picker reads this)

Usage: python scripts/gen-gallery.py
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "apps", "ai-service"))

from app.separate import separate_image  # noqa: E402

SRC_DIR = os.path.join(ROOT, "apps", "web", "public", "demo-photos")
OUT_DIR = os.path.join(ROOT, "apps", "web", "public", "scenes", "gallery")


def _photos() -> list[dict[str, str]]:
    manifest_path = os.path.join(SRC_DIR, "manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            photos: list[dict[str, str]] = json.load(f)["photos"]
            return photos
    return [
        {"file": f}
        for f in sorted(os.listdir(SRC_DIR))
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]


def main() -> None:
    photos = _photos()
    index: list[dict[str, object]] = []
    print(f"Separating {len(photos)} photos -> scenes/gallery/")
    for photo in photos:
        name = photo["file"]
        scene_id = os.path.splitext(name)[0]
        title = f"Photo {scene_id}"
        try:
            with open(os.path.join(SRC_DIR, name), "rb") as f:
                data = f.read()
            scene = separate_image(data, os.path.join(OUT_DIR, scene_id), scene_id, title)
            index.append(
                {
                    "id": scene_id,
                    "title": title,
                    "preview": f"gallery/{scene_id}/preview.png",
                    "aspect": scene["aspectRatio"],
                }
            )
            print(f"  ok  {scene_id}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL {scene_id}: {exc}", flush=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "index.json"), "w") as f:
        json.dump({"scenes": index}, f, indent=2)
    print(f"Wrote {len(index)} scenes + index.json")


if __name__ == "__main__":
    main()
