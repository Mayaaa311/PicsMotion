#!/usr/bin/env python3
"""Download the pretrained art-style networks (all git-ignored).

Three families, because no single source covers the styles we want:

* **ONNX fast-neural-style** (ONNX Model Zoo) — the zoo ships exactly five nets.
  Their declared input is a fixed 224x224, but the networks are fully
  convolutional, so the H/W dims are rewritten to be dynamic and they then run at
  any resolution (sharp output instead of an upscaled thumbnail).
* **Torch7 fast-neural-style** (Johnson's original release) — includes weights the
  zoo never converted, notably **Starry Night**, i.e. the real Van Gogh style.
  OpenCV reads `.t7` directly, so no torch install is needed (requires OpenCV 4.x;
  OpenCV 5 dropped the Torch importer).
* **AnimeGANv3** — a GAN trained on anime films; the `Hayao` weights give Hayao
  Miyazaki / Ghibli-style backgrounds.

Usage: python scripts/prep-style-models.py
"""
from __future__ import annotations

import os
import urllib.request

import onnx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "apps", "web", "public", "models")
STYLE_DIR = os.path.join(MODELS, "style")
ANIME_DIR = os.path.join(MODELS, "anime")

ZOO = (
    "https://github.com/onnx/models/raw/main/validated/vision/style_transfer/"
    "fast_neural_style/model"
)
ONNX_MODELS = ["mosaic", "candy", "udnie", "rain-princess"]

TORCH_BASE = "https://cs.stanford.edu/people/jcjohns/fast-neural-style/models/eccv16"
TORCH_MODELS = ["starry_night"]

ANIME_URL = (
    "https://github.com/TachibanaYoshino/AnimeGANv3/releases/download/v1.1.0/"
    "AnimeGANv3_Hayao_36.onnx"
)
ANIME_NAME = "AnimeGANv3_Hayao_36.onnx"

#: A failed download often lands as a small HTML error page; treat those as absent.
MIN_BYTES = 1_000_000


def _fetch(url: str, path: str, label: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) >= MIN_BYTES:
        print(f"  {label}: present ({os.path.getsize(path) // 1024} KB)")
        return True
    print(f"  downloading {label} …")
    urllib.request.urlretrieve(url, path)  # noqa: S310 (pinned, trusted releases)
    if os.path.getsize(path) < MIN_BYTES:
        os.remove(path)
        print(f"  {label}: FAILED (server returned {os.path.getsize(path)} bytes)")
        return False
    print(f"  {label}: {os.path.getsize(path) // 1024} KB")
    return True


def main() -> None:
    os.makedirs(STYLE_DIR, exist_ok=True)
    os.makedirs(ANIME_DIR, exist_ok=True)

    print("ONNX fast-neural-style (dynamic resolution):")
    for name in ONNX_MODELS:
        path = os.path.join(STYLE_DIR, f"{name}.onnx")
        if not _fetch(f"{ZOO}/{name}-9.onnx", path, f"{name}.onnx"):
            continue
        model = onnx.load(path)
        for tensor in list(model.graph.input) + list(model.graph.output):
            dims = tensor.type.tensor_type.shape.dim
            if len(dims) == 4:
                for axis, param in ((2, "H"), (3, "W")):
                    dims[axis].dim_param = param
                    dims[axis].ClearField("dim_value")
        onnx.save(model, path)

    print("Torch7 fast-neural-style (Van Gogh):")
    for name in TORCH_MODELS:
        _fetch(f"{TORCH_BASE}/{name}.t7", os.path.join(STYLE_DIR, f"{name}.t7"), f"{name}.t7")

    print("AnimeGANv3 (Miyazaki):")
    _fetch(ANIME_URL, os.path.join(ANIME_DIR, ANIME_NAME), ANIME_NAME)

    print(f"Done -> {os.path.relpath(MODELS, ROOT)}")


if __name__ == "__main__":
    main()
