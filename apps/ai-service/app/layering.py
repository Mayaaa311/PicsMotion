"""CPU layer-separation primitives: turn one photo into a stack of depth strata.

Runs entirely locally on pretrained ONNX weights — no API keys.

**Who is the subject** — :class:`SubjectSegmenter` (U^2-Net, the network behind
``rembg``) finds the salient object regardless of its class. This replaced a
heuristic built from vertical position, sky-ness and local sharpness: that guess
cannot tell "the penguin" from "the snow", so it produced fragmented masks that
sliced straight through objects. :func:`estimate_depth` keeps the old heuristic
only as a fallback for when the weights are absent.

**How far away everything is** — :class:`DepthEstimator` (Depth-Anything V2) gives
a real monocular depth ordering, and :func:`depth_bands` cuts the non-subject area
into strata at percentiles of that depth. A penguin photo becomes
penguin / rock+snow / mountain / sky rather than two slabs.

**Making the stack hold up when it moves** — three rules, each learned from a
visible bug:
  * :func:`reconstruct_plate` erases every moving layer from the background
    *entirely*. Keeping the interior "because the cutout covers it" left ghost
    duplicates, since a cutout displaces by parallax *and* baseScale and its
    feathered edge is partly transparent.
  * :func:`complete_behind` grows each layer underneath the layers in front of it
    and inpaints what it gains, so a nearer layer sliding aside uncovers this
    stratum's own material instead of a silhouette-shaped hole.
  * :func:`fill_holes` makes cutout interiors fully opaque; pinholes left inside a
    mask turn semi-transparent once feathered and read as a see-through subject.

:func:`smooth_inpaint` does all the filling, blending a full-resolution Telea pass
at the rim (where a shift actually uncovers pixels) into a downscaled pass deeper
in (which has no radial streaks).
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageFilter


def feather(mask01: np.ndarray, radius: float) -> np.ndarray:
    """Gaussian-soften a 0..1 mask so cutout edges composite smoothly."""
    a = Image.fromarray((np.clip(mask01, 0, 1) * 255).astype(np.uint8), mode="L")
    return np.asarray(a.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255.0


def guided_filter(guide01: np.ndarray, src01: np.ndarray, radius: int, eps: float) -> np.ndarray:
    """Edge-preserving filter of ``src01`` using ``guide01`` as the edge guide.

    He et al.'s guided filter, built from box filters only (no opencv-contrib).
    Transfers the guide's edges onto the source, which is what makes a coarse
    depth estimate follow object outlines.
    """
    r = max(1, int(radius))
    ksize = (r * 2 + 1, r * 2 + 1)
    guide = guide01.astype(np.float32)
    src = src01.astype(np.float32)

    mean_guide = cv2.boxFilter(guide, -1, ksize)
    mean_src = cv2.boxFilter(src, -1, ksize)
    corr_guide = cv2.boxFilter(guide * guide, -1, ksize)
    corr_cross = cv2.boxFilter(guide * src, -1, ksize)

    var_guide = corr_guide - mean_guide * mean_guide
    cov_cross = corr_cross - mean_guide * mean_src

    a = cov_cross / (var_guide + eps)
    b = mean_src - a * mean_guide
    out: np.ndarray = cv2.boxFilter(a, -1, ksize) * guide + cv2.boxFilter(b, -1, ksize)
    return out


def estimate_depth(rgb: np.ndarray) -> np.ndarray:
    """Per-pixel depth proxy in 0..1 (0 = far, 1 = near), edge-aligned.

    Combines three cheap cues, then snaps the result to image edges:
      * vertical position — in most photographs, lower is nearer;
      * sky-ness (bright + desaturated) — pushed far away;
      * local sharpness — in-focus detail is usually nearer than soft distance.
    """
    height, width = rgb.shape[:2]
    diag = max(width, height)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255.0
    mx = np.maximum(np.maximum(red, green), blue)
    mn = np.minimum(np.minimum(red, green), blue)
    sat = (mx - mn) / (mx + 1e-6)

    vertical = np.linspace(0.0, 1.0, height, dtype=np.float32).reshape(height, 1) * np.ones(
        (1, width), np.float32
    )
    skyness = np.clip(lum * (1.0 - sat) * 1.4, 0, 1).astype(np.float32)

    # Local sharpness: blurred gradient magnitude, robustly normalized.
    gray = (lum * 255).astype(np.uint8)
    grad = np.abs(cv2.Laplacian(gray, cv2.CV_32F, ksize=3))
    grad = cv2.GaussianBlur(grad, (0, 0), diag * 0.006)
    hi = float(np.percentile(grad, 97)) or 1.0
    sharp = np.clip(grad / hi, 0, 1).astype(np.float32)

    depth = 0.58 * vertical + 0.24 * sharp + 0.18 * (1.0 - skyness)
    depth = np.clip(depth, 0, 1).astype(np.float32)

    # Snap the coarse estimate to real edges so bands follow objects.
    depth = guided_filter(lum.astype(np.float32), depth, radius=int(diag * 0.02), eps=1e-3)
    refined: np.ndarray = np.clip(depth, 0, 1).astype(np.float32)
    return refined


def clean_mask(
    core: np.ndarray, diag: float, *, min_area_frac: float = 0.002, close_frac: float = 0.012
) -> np.ndarray:
    """Turn a noisy boolean mask into coherent blobs.

    Closes pinholes, opens away speckle, then drops connected components smaller
    than ``min_area_frac`` of the frame — the step that removes the scattered
    single-pixel confetti a raw colour/depth threshold produces.
    """
    mask: np.ndarray = (core.astype(np.uint8)) * 255
    k = max(3, int(diag * close_frac)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    ko = max(3, int(diag * close_frac * 0.5)) | 1
    mask = cv2.morphologyEx(
        mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ko, ko))
    )

    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        (mask > 0).astype(np.uint8), connectivity=8
    )
    if count > 1:
        min_area = min_area_frac * mask.size
        keep = np.zeros(count, bool)
        for i in range(1, count):
            keep[i] = stats[i, cv2.CC_STAT_AREA] >= min_area
        mask = np.where(keep[labels], 255, 0).astype(np.uint8)
    return (mask > 0)


def reconstruct_plate(
    rgb: np.ndarray, silhouette: np.ndarray, margin_px: int
) -> tuple[np.ndarray, float]:
    """Background plate with the extracted subject removed ENTIRELY.

    ``silhouette`` is the (hard) union of every extracted cutout. The subject is
    erased over its whole silhouette plus a ``margin_px`` dilation (which also
    takes the anti-aliased fringe, otherwise a halo of subject colour survives
    just outside the cutout).

    An earlier version kept the silhouette's interior as original pixels on the
    theory that the cutout always covers it. That was wrong twice over: a cutout
    can displace further than the retained band (parallax *plus* its baseScale),
    and a feathered cutout edge is partly transparent — both let the retained
    subject show through as a ghost duplicate. Everything outside the silhouette
    is still untouched original pixels, so the visible plate stays photo-sharp.

    Returns the plate RGB and the fraction of the frame that is generated.
    """
    hard = (silhouette > 0).astype(np.uint8)
    k = max(3, int(margin_px)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    generated = cv2.dilate(hard, kernel)

    filled = smooth_inpaint(rgb, generated > 0)

    plate = np.clip(rgb, 0, 255).astype(np.uint8).copy()
    take = generated > 0
    plate[take] = filled[take]
    return plate.astype(np.float32), float(take.mean())


def depth_bands(
    depth: np.ndarray,
    exclude: np.ndarray,
    diag: float,
    cuts: tuple[float, float] = (0.38, 0.72),
) -> list[np.ndarray]:
    """Split the not-excluded area into coherent depth strata, nearest first.

    Percentiles are taken over the remaining area only, so the split adapts to
    each photo: a penguin scene separates rock/snow from mountain from sky, and a
    garden scene separates water from planting from skyline. Whatever falls below
    the lowest cut is left to the opaque background plate.
    """
    remaining = ~exclude
    values = depth[remaining]
    if values.size == 0:
        return []
    low = float(np.percentile(values, cuts[0] * 100))
    high = float(np.percentile(values, cuts[1] * 100))

    near = remaining & (depth > high)
    mid = remaining & (depth > low) & (depth <= high)
    return [
        fill_holes(clean_mask(near, diag, min_area_frac=0.003)),
        fill_holes(clean_mask(mid, diag, min_area_frac=0.003)),
    ]


def smooth_inpaint(rgb: np.ndarray, hole: np.ndarray) -> np.ndarray:
    """Fill ``hole`` in ``rgb`` without Telea's radial streaks.

    Telea samples along the hole boundary, which on a large region fans out into
    long radial streaks. Inpainting a downscaled copy instead yields a smooth,
    plausible gradient but loses boundary detail, so the two are blended by
    distance from the edge: real texture continues at the rim (which is the part a
    parallax shift actually uncovers) and the smooth fill takes over deeper in,
    where nothing is ever seen.
    """
    mask8 = (hole.astype(np.uint8)) * 255
    bgr = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)

    fine = cv2.inpaint(bgr, mask8, 6, cv2.INPAINT_TELEA).astype(np.float32)

    scale = 0.25
    small = cv2.resize(bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    small_mask = cv2.resize(
        mask8, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST
    )
    coarse = cv2.resize(
        cv2.inpaint(small, small_mask, 5, cv2.INPAINT_TELEA),
        (bgr.shape[1], bgr.shape[0]),
        interpolation=cv2.INTER_LINEAR,
    ).astype(np.float32)

    # Blend weight: 0 at the hole's rim, 1 once we are well inside it.
    distance = cv2.distanceTransform(hole.astype(np.uint8), cv2.DIST_L2, 3)
    blend_px = max(8.0, max(rgb.shape[0], rgb.shape[1]) * 0.02)
    weight = np.clip(distance / blend_px, 0, 1)[..., None]
    merged = fine * (1.0 - weight) + coarse * weight
    out: np.ndarray = cv2.cvtColor(
        np.clip(merged, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB
    )
    return out


def complete_behind(
    rgb: np.ndarray, mask: np.ndarray, occluders: np.ndarray, margin_px: int
) -> tuple[np.ndarray, np.ndarray]:
    """Extend a layer underneath the layers in front of it.

    A layer cut strictly to its own visible pixels has a hole exactly where a
    nearer layer covered it — so as soon as that nearer layer parallaxes aside,
    its silhouette shows through as a hole down to the background. This layer is
    therefore given content across its occluders' silhouettes, inpainted from its
    own surroundings, so what gets uncovered continues *this* stratum: snow behind
    the penguin, not sky.

    Fill exactly the occluded silhouette (plus ``margin_px`` for the occluder's
    anti-aliased fringe) and nothing more. Growing it by the occluder's full travel
    distance instead — as this once did — overwrites pixels that are *visible at
    rest*, which showed up as a mushy halo ringing every cutout.

    Returns the layer's RGB and its (hard) coverage mask.
    """
    if not occluders.any():
        return np.clip(rgb, 0, 255).astype(np.uint8), mask

    k = max(3, int(margin_px)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    hidden = cv2.dilate(occluders.astype(np.uint8), kernel) > 0
    hole = hidden & ~mask
    if not hole.any():
        return np.clip(rgb, 0, 255).astype(np.uint8), mask

    filled = smooth_inpaint(rgb, hole)
    out = np.clip(rgb, 0, 255).astype(np.uint8).copy()
    out[hole] = filled[hole]
    return out, (mask | hole)


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Close enclosed holes so a cutout's interior is fully opaque.

    Pinholes left inside a subject mask become semi-transparent once the mask is
    feathered, which reads as a see-through subject.
    """
    binary = (mask > 0).astype(np.uint8) * 255
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(binary, contours, -1, 255, thickness=cv2.FILLED)
    return binary > 0


class _OnnxModel:
    """Lazily-loaded CPU ONNX session with a bounded thread pool.

    onnxruntime otherwise sizes every pool to the core count and never returns
    its arena, which on a many-core laptop is enough retained memory for the
    kernel OOM killer to take out the desktop.
    """

    def __init__(self, model_path: str, intra_op_threads: int = 4) -> None:
        self._path = model_path
        self._threads = intra_op_threads
        self._session: object | None = None

    def is_available(self) -> bool:
        import os

        return os.path.isfile(self._path)

    def session(self) -> Any:
        if self._session is not None:
            return self._session
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = self._threads
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        self._session = ort.InferenceSession(
            self._path, sess_options=options, providers=["CPUExecutionProvider"]
        )
        return self._session


class DepthEstimator(_OnnxModel):
    """Monocular relative depth with Depth-Anything V2 (ViT-S, ONNX export).

    Returns a genuine depth ordering for the scene, which is what lets a photo be
    split into real strata (subject / rocks / mountain / sky) instead of the
    position-and-sharpness guess a heuristic can make. The exported graph takes a
    fixed 518x518 input, so the frame is resized in and the depth resized back out.
    """

    INPUT_SIZE = 518
    _MEAN = np.array([0.485, 0.456, 0.406], np.float32)
    _STD = np.array([0.229, 0.224, 0.225], np.float32)

    def depth(self, rgb: np.ndarray) -> np.ndarray:
        """Relative depth in 0..1 at the image's resolution (1 = nearest)."""
        height, width = rgb.shape[:2]
        small = cv2.resize(
            np.clip(rgb, 0, 255).astype(np.uint8),
            (self.INPUT_SIZE, self.INPUT_SIZE),
            interpolation=cv2.INTER_AREA,
        ).astype(np.float32) / 255.0
        tensor = ((small - self._MEAN) / self._STD).transpose(2, 0, 1)[None].astype(np.float32)

        session = self.session()
        raw = np.asarray(session.run(None, {session.get_inputs()[0].name: tensor})[0])
        field = raw[0] if raw.ndim == 3 else raw
        lo, hi = float(field.min()), float(field.max())
        normalized = (field - lo) / (hi - lo + 1e-8)
        resized: np.ndarray = cv2.resize(
            normalized.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR
        )
        return resized


class SubjectSegmenter:
    """Salient-object segmentation with U^2-Net (the network behind ``rembg``).

    Identifies the main subject of a photo regardless of its class, which is what
    layer separation actually needs — position/sharpness heuristics cannot tell
    "the penguin" from "the snow" and produce masks that slice through objects.
    Runs locally on CPU; weights are git-ignored (prep-segmentation-model.py).
    """

    #: U^2-Net's fixed training resolution.
    INPUT_SIZE = 320
    _MEAN = np.array([0.485, 0.456, 0.406], np.float32)
    _STD = np.array([0.229, 0.224, 0.225], np.float32)

    def __init__(self, model_path: str, intra_op_threads: int = 4) -> None:
        self._path = model_path
        self._threads = intra_op_threads
        self._session: object | None = None

    def is_available(self) -> bool:
        import os

        return os.path.isfile(self._path)

    def _get_session(self) -> object:
        if self._session is not None:
            return self._session
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = self._threads
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        self._session = ort.InferenceSession(
            self._path, sess_options=options, providers=["CPUExecutionProvider"]
        )
        return self._session

    def saliency(self, rgb: np.ndarray) -> np.ndarray:
        """Subject probability map in 0..1 at the input image's resolution."""
        height, width = rgb.shape[:2]
        small = cv2.resize(
            np.clip(rgb, 0, 255).astype(np.uint8),
            (self.INPUT_SIZE, self.INPUT_SIZE),
            interpolation=cv2.INTER_AREA,
        ).astype(np.float32) / 255.0
        normalized = (small - self._MEAN) / self._STD
        tensor = normalized.transpose(2, 0, 1)[None].astype(np.float32)

        session = self._get_session()
        output = session.run(None, {session.get_inputs()[0].name: tensor})[0]  # type: ignore[attr-defined]
        prob = np.asarray(output)[0, 0]
        lo, hi = float(prob.min()), float(prob.max())
        prob = (prob - lo) / (hi - lo + 1e-8)
        resized: np.ndarray = cv2.resize(prob, (width, height), interpolation=cv2.INTER_LINEAR)
        return resized

    def detect(self, rgb: np.ndarray, threshold: float = 0.5) -> tuple[np.ndarray, float]:
        """Solid subject mask plus a confidence score in 0..1.

        Confidence is the mean saliency inside the mask. A photo with a real
        subject saturates near 1.0; a landscape with nothing salient still yields
        *some* above-threshold region, but a vague, barely-confident one — which is
        how a mountainside ended up cut out as a "subject" and inpainted into a
        mushy blob. Callers should require a high score before trusting the mask.
        """
        diag = max(rgb.shape[1], rgb.shape[0])
        field = self.saliency(rgb)
        core = field > threshold
        cleaned = clean_mask(core, diag, min_area_frac=0.004, close_frac=0.008)
        mask = fill_holes(cleaned)
        confidence = float(field[mask].mean()) if mask.any() else 0.0
        return mask, confidence

    def subject_mask(self, rgb: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """Solid boolean mask of the main subject (holes filled, speckle dropped)."""
        return self.detect(rgb, threshold)[0]


def save_rgba(rgb: np.ndarray, alpha01: np.ndarray, path: str) -> None:
    import os

    height, width = alpha01.shape
    out = np.zeros((height, width, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = (np.clip(alpha01, 0, 1) * 255).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(out, "RGBA").save(path)
