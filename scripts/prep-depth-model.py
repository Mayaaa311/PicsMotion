#!/usr/bin/env python3
"""Download the Depth-Anything V2 (ViT-S) ONNX model used for depth strata.

The layer separator uses monocular depth to split a photo into near / mid / far
bands (see :mod:`app.separate`). Weights are git-ignored; this fetches the same
ONNX export the local setup uses, pinned to a release asset.

Usage: python scripts/prep-depth-model.py
"""
from __future__ import annotations

import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "apps", "web", "public", "models", "depth")
# Pinned release asset (Depth-Anything V2 small, Apache-2.0). Byte-verified to
# match the model the pipeline was built against.
URL = (
    "https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/"
    "v2.0.0/depth_anything_v2_vits.onnx"
)
NAME = "depth_anything_v2_vits.onnx"
MIN_BYTES = 90 * 1024 * 1024


def main() -> None:
    os.makedirs(DEST, exist_ok=True)
    path = os.path.join(DEST, NAME)
    if os.path.exists(path) and os.path.getsize(path) >= MIN_BYTES:
        print(f"  {NAME}: already present ({os.path.getsize(path) // (1024 * 1024)} MB)")
        return
    print(f"  downloading {NAME} (~95 MB) …")
    urllib.request.urlretrieve(URL, path)  # noqa: S310 (pinned release asset)
    print(f"  {NAME}: {os.path.getsize(path) // (1024 * 1024)} MB -> {os.path.relpath(DEST, ROOT)}")


if __name__ == "__main__":
    main()
