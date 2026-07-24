#!/usr/bin/env python3
"""Generate the default demo scene from a single photo.

Delegates to :func:`app.separate.separate_image`, the same depth-ordered pipeline
the gallery and photo uploads use — U²-Net subject cutout + Depth-Anything strata,
every layer placed at its true depth. There is no bespoke separation here anymore,
so the default scene can never drift from what an uploaded photo gets.

Usage:
    python scripts/gen-photo-scene.py <source.jpg> <scene-id>
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "apps", "ai-service"))

from app.separate import separate_image  # noqa: E402


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/demo-photos/854.jpg"
    scene_id = sys.argv[2] if len(sys.argv) > 2 else "yosemite-falls"
    title = sys.argv[3] if len(sys.argv) > 3 else "Yosemite Falls — Through the Pines"
    out_dir = os.path.join(ROOT, "apps", "web", "public", "scenes", scene_id)

    with open(os.path.join(ROOT, src), "rb") as f:
        data = f.read()
    print(f"Separating {src} -> scenes/{scene_id}")
    separate_image(data, out_dir, scene_id, title)
    print("Done.")


if __name__ == "__main__":
    main()
