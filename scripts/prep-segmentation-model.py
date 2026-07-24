#!/usr/bin/env python3
"""Download the U^2-Net salient-object segmentation model (subject cutouts).

U^2-Net is the background-removal network behind `rembg`. It finds the *main
subject* of a photograph regardless of its class, which is what the layer
separator needs: heuristics based on vertical position or local sharpness cannot
identify "the penguin" or "the elk", so they produce fragmented masks that slice
through objects.

The weights are git-ignored (apps/web/public/models/ is ignored wholesale).

Usage: python scripts/prep-segmentation-model.py
"""
from __future__ import annotations

import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "apps", "web", "public", "models", "seg")
# Published release asset of the rembg project (Apache-2.0 / MIT tooling around
# the U^2-Net weights, which are released for research + commercial use).
URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"
NAME = "u2net.onnx"
MIN_BYTES = 100 * 1024 * 1024


def main() -> None:
    os.makedirs(DEST, exist_ok=True)
    path = os.path.join(DEST, NAME)
    if os.path.exists(path) and os.path.getsize(path) >= MIN_BYTES:
        print(f"  {NAME}: already present ({os.path.getsize(path) // (1024 * 1024)} MB)")
        return
    print(f"  downloading {NAME} (~176 MB) …")
    urllib.request.urlretrieve(URL, path)  # noqa: S310 (pinned release asset)
    print(f"  {NAME}: {os.path.getsize(path) // (1024 * 1024)} MB -> {os.path.relpath(DEST, ROOT)}")


if __name__ == "__main__":
    main()
