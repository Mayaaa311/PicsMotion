"""Universal CPU layer separation for an uploaded/chosen photo (local, no keys).

Plans a stack of depth strata per photo (see :mod:`app.layering` for the pieces):

1. the salient subject (U^2-Net) becomes its own front layer, cut as a whole
   object with a solid interior;
2. real monocular depth (Depth-Anything V2) splits what remains into `near` and
   `mid` strata, so a penguin scene yields penguin / rock+snow / mountain / sky;
3. the opaque background plate is the original photo with every moving layer
   erased, so nothing can leave a ghost of itself behind when it parallaxes;
4. each stratum is then completed *underneath* the layers in front of it, so a
   nearer layer sliding aside uncovers that stratum's own material.

Bands too small to earn a layer are left to the plate, and a photo with no clear
subject simply gets the depth strata. Cutouts always keep ORIGINAL photographic
pixels; only genuinely hidden regions are generated.

Writes a scene package to <out_dir> and returns the scene dict.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import numpy as np
from PIL import Image

from app.config import get_settings
from app.layering import (
    DepthEstimator,
    SubjectSegmenter,
    clean_mask,
    complete_behind,
    estimate_depth,
    feather,
    fill_holes,
    reconstruct_plate,
    save_rgba,
)

MAX_SIDE = 1600
#: Margin (share of the long edge) added when completing a layer under its
#: occluders — just enough to swallow the occluder's anti-aliased fringe. It must
#: stay small: anything wider overwrites pixels that are visible at rest.
OCCLUDER_MARGIN_FRACTION = 0.002
#: Mean saliency required inside a subject mask before it is trusted as an object.
SUBJECT_MIN_CONFIDENCE = 0.8
#: A salient mask outside this coverage range is treated as "no clear subject".
SUBJECT_MIN_COVERAGE = 0.02
SUBJECT_MAX_COVERAGE = 0.85


def image_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def _layer(
    layer_id: str, role: str, depth: float, parallax: float, max_off: float
) -> dict[str, Any]:
    return {
        "id": layer_id,
        "name": layer_id.capitalize(),
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
        "audioSensitivity": {
            "bass": 0.15,
            "lowMid": 0.1,
            "highMid": 0.05,
            "treble": 0.05,
            "beat": 0.1,
            "loudness": 0.15,
        },
        "importance": 0.5,
        "locked": role == "background",
        "revealBudget": {"maxOffsetX": max_off + 0.01, "maxOffsetY": max_off, "confidence": 0.6},
        "provenance": (
            {
                "visiblePixels": "mixed",
                "sourceImageHash": "upload",
                "completionProvider": "opencv-telea-cpu",
            }
            if role == "background"
            else {"visiblePixels": "original", "sourceImageHash": "upload"}
        ),
    }


def separate_image(data: bytes, out_dir: str, scene_id: str, title: str) -> dict[str, Any]:
    """Separate `data` (image bytes) into a 3-layer scene written under out_dir."""
    from io import BytesIO

    img = Image.open(BytesIO(data)).convert("RGB")
    if max(img.size) > MAX_SIDE:
        s = MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * s), round(img.height * s)))
    w, h = img.size
    rgb = np.asarray(img).astype(np.float32)
    diag = max(w, h)

    settings = get_settings()
    segmenter = SubjectSegmenter(settings.segmentation_model_path, settings.style_intra_op_threads)
    estimator = DepthEstimator(settings.depth_model_path, settings.style_intra_op_threads)

    # 1) The salient subject becomes its own front layer, cut as a whole object.
    subject_core: np.ndarray | None = None
    if segmenter.is_available():
        candidate, confidence = segmenter.detect(rgb, settings.subject_threshold)
        coverage = float(candidate.mean())
        # Reject degenerate results: nothing salient, "everything is subject", or a
        # vague low-confidence blob (a landscape with no real subject).
        if not SUBJECT_MIN_COVERAGE <= coverage <= SUBJECT_MAX_COVERAGE:
            print(f"  {scene_id}: no subject (coverage {coverage:.1%})")
        elif confidence < SUBJECT_MIN_CONFIDENCE:
            print(f"  {scene_id}: subject too vague (confidence {confidence:.2f}), depth only")
        else:
            subject_core = candidate

    # 2) Monocular depth (1 = nearest). EVERY layer is placed by its true depth,
    #    so a salient-but-distant subject sits at its real distance instead of
    #    being forced to the front. (A castle behind foreground trees is the
    #    salient object, yet it must render *behind* — and parallax *less than* —
    #    the trees, or it appears to float above them.)
    depth = estimator.depth(rgb) if estimator.is_available() else estimate_depth(rgb)

    # Front-to-back plan entries: (id, role, mask, nearness in 0..1).
    entries: list[tuple[str, str, np.ndarray, float]] = []
    claimed = np.zeros(rgb.shape[:2], bool)

    subject_near = 0.5
    if subject_core is not None:
        subject_near = float(np.median(depth[subject_core]))
        entries.append(("subject", "primary-subject", subject_core, subject_near))
        claimed |= subject_core

    # Foreground: whatever is clearly NEARER than the subject, so it occludes it.
    # Keyed off the subject's own depth — this is what puts the trees in front of
    # a distant castle rather than slicing a fixed band off the bottom.
    if subject_core is not None:
        fg_cut = min(0.92, subject_near + 0.10)
    else:
        fg_cut = float(np.percentile(depth, 80))
    near_core = fill_holes(clean_mask((depth > fg_cut) & ~claimed, diag, min_area_frac=0.003))
    if float(near_core.mean()) >= settings.min_layer_coverage:
        entries.append(("near", "foreground", near_core, float(np.median(depth[near_core]))))
        claimed |= near_core

    # Midground: a stratum behind the subject but in front of the far plate.
    if subject_core is not None:
        mid_mask = (depth > max(0.08, subject_near - 0.16)) & (depth < subject_near)
    else:
        mid_mask = (depth > float(np.percentile(depth, 45))) & (depth <= fg_cut)
    mid_core = fill_holes(clean_mask(mid_mask & ~claimed, diag, min_area_frac=0.004))
    if float(mid_core.mean()) >= settings.min_layer_coverage:
        entries.append(("mid", "midground", mid_core, float(np.median(depth[mid_core]))))
        claimed |= mid_core

    # 3) The plate is the original photo with every moving layer erased, so no
    #    layer can leave a ghost of itself behind when it parallaxes.
    plate, generated = reconstruct_plate(rgb, claimed, int(diag * 0.006))
    save_rgba(plate, np.ones((h, w), np.float32), os.path.join(out_dir, "layers", "plate.png"))

    # 4) Complete each layer behind the ones IN FRONT of it (process nearest
    #    first so occluders accumulate), then write it. Scene depth = 1 - nearness
    #    (larger = farther); parallax/offset scale with nearness, so nearer layers
    #    both render on top and move more.
    margin_px = int(diag * OCCLUDER_MARGIN_FRACTION)
    layer_specs: list[dict[str, Any]] = [_layer("plate", "background", 0.94, 0.04, 0.012)]
    occluders = np.zeros(rgb.shape[:2], bool)
    for layer_id, role, mask, nearness in sorted(entries, key=lambda e: e[3], reverse=True):
        layer_rgb, layer_mask = complete_behind(rgb, mask, occluders, margin_px)
        # Cutouts keep ORIGINAL pixels, solid inside, with a thin edge feather.
        alpha = feather(layer_mask.astype(np.float32), diag * 0.0025)
        save_rgba(layer_rgb, alpha, os.path.join(out_dir, "layers", f"{layer_id}.png"))
        parallax = 0.05 + 0.42 * nearness
        max_off = 0.012 + 0.05 * nearness
        layer_specs.append(_layer(layer_id, role, round(1.0 - nearness, 3), parallax, max_off))
        occluders |= mask

    plan = entries  # for the summary line below

    strata = ", ".join(f"{p[0]} {float(p[2].mean()):.0%}" for p in plan) or "none"
    print(f"  separated {scene_id}: {strata}; plate generated {generated:.1%}")

    Image.fromarray(plate.astype(np.uint8), "RGB").save(os.path.join(out_dir, "background.png"))
    # The true, untouched photo — what whole-image style transfer reads from.
    os.makedirs(os.path.join(out_dir, "original"), exist_ok=True)
    img.save(os.path.join(out_dir, "original", "normalized.png"))
    img.resize((max(1, w // 4), max(1, h // 4))).save(os.path.join(out_dir, "preview.png"))

    scene = {
        "version": "1.0",
        "id": scene_id,
        "title": title,
        "width": w,
        "height": h,
        "aspectRatio": round(w / h, 4),
        "originalImageUrl": "original/normalized.png",
        "backgroundPlateUrl": "background.png",
        "preset": "soft-nature",
        "visualAnalysis": {"sceneType": "photo", "mainSubject": title},
        "layers": layer_specs,
        "atmosphere": {"vignette": 0.05},
        "camera": {"fov": 45, "parallaxStrength": 0.16, "driftStrength": 0.02},
        "audioBindings": [
            {
                "source": "bass",
                "target": "camera.zoom",
                "scale": 0.22,
                "offset": 0,
                "smoothing": 0.2,
                "clamp": [0, 0.28],
                "curve": "easeOut",
            },
        ],
        "metadata": {
            "createdAt": "2026-07-23T00:00:00Z",
            "pipelineVersion": "0.3.0-cpu-depth-guided+band-inpaint",
        },
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "scene.json"), "w") as f:
        json.dump(scene, f, indent=2)
    return scene
