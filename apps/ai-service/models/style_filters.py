"""Algorithmic art styles built from published image-processing techniques.

These cover the *graphic* styles that neural style transfer does badly, and each
one is the technique that actually defines the look rather than an arbitrary
filter chain:

* ``ink_sketch`` / ``watercolor`` — OpenCV's non-photorealistic-rendering module
  (Gastal & Oliveira domain-transform filtering), i.e. ``cv2.pencilSketch`` and
  ``cv2.stylization``.
* ``comic`` — Ben-Day halftone dot screen over posterised colour with ink edges,
  the classic four-colour comic printing process.
* ``pixel_art`` — area downsample + k-means palette quantisation + nearest-neighbour
  upscale: how retro sprite/indexed-colour art is actually produced.
* ``low_poly`` — Delaunay triangulation (``cv2.Subdiv2D``) over feature points with
  flat per-facet colour, the standard low-poly vector construction.
* ``cyberpunk`` / ``vaporwave`` — gradient-map (duotone) colour grading plus neon
  edge bloom / scanlines + chromatic offset, the defining grades of both looks.

Every function takes and returns an ``HxWx3`` uint8 RGB array.
"""

from __future__ import annotations

from collections.abc import Callable

import cv2
import numpy as np


def _luminance01(rgb: np.ndarray) -> np.ndarray:
    return (
        0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    ).astype(np.float32) / 255.0


def _gradient_map(lum01: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    """Map luminance through a colour ramp (a duotone/gradient-map grade)."""
    lut = np.zeros((256, 3), np.float32)
    positions = [int(round(p * 255)) for p, _ in stops]
    for i in range(len(stops) - 1):
        a, b = positions[i], positions[i + 1]
        ca = np.array(stops[i][1], np.float32)
        cb = np.array(stops[i + 1][1], np.float32)
        span = max(1, b - a)
        for x in range(a, b + 1):
            t = (x - a) / span
            lut[x] = ca * (1 - t) + cb * t
    lut[: positions[0]] = np.array(stops[0][1], np.float32)
    lut[positions[-1] :] = np.array(stops[-1][1], np.float32)
    idx = np.clip(lum01 * 255.0, 0, 255).astype(np.uint8)
    return lut[idx].astype(np.uint8)


def _edges(rgb: np.ndarray, low: int = 60, high: int = 160) -> np.ndarray:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return cv2.Canny(cv2.GaussianBlur(gray, (0, 0), 1.2), low, high)


# ---------------------------------------------------------------------------
# OpenCV non-photorealistic rendering
# ---------------------------------------------------------------------------


def ink_sketch(rgb: np.ndarray) -> np.ndarray:
    """Monochrome pencil/ink linework (cv2.pencilSketch, NPR module)."""
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    gray, _color = cv2.pencilSketch(bgr, sigma_s=60, sigma_r=0.07, shade_factor=0.05)
    out = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
    # Deepen the darks a little so strokes read on screen.
    deepened: np.ndarray = np.clip((out.astype(np.float32) - 18) * 1.12, 0, 255).astype(np.uint8)
    return deepened


def watercolor(rgb: np.ndarray) -> np.ndarray:
    """Loose transparent watercolour on white cold-press paper.

    Built to read like an actual watercolour sketch rather than a softened photo.
    The decisive ingredient is **unpainted paper**: real watercolour leaves the
    highlights as bare white sheet, which is what gives it air and makes the
    pigment look transparent. So highlights are pushed to pure paper white, the
    remaining tones are lifted into a high key with saturated but thin pigment,
    contours get a darker "wet edge" where a wash pooled and dried, and a little
    low-frequency granulation stands in for the paper's tooth.
    """
    height, width = rgb.shape[:2]
    diag = max(width, height)

    # Flatten detail into loose washes, then into a few flat pigment areas.
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    abstracted = cv2.cvtColor(cv2.stylization(bgr, sigma_s=100, sigma_r=0.45), cv2.COLOR_BGR2RGB)
    flat = _quantize(cv2.bilateralFilter(abstracted, 9, 90, 90), 18)
    # Blend the flat pigment areas back toward the continuous wash and soften the
    # quantisation steps: pure quantisation reads as flat gouache/vector art,
    # whereas watercolour keeps soft, bleeding transitions between washes.
    blended = cv2.addWeighted(flat, 0.55, abstracted, 0.45, 0)
    washes = cv2.GaussianBlur(blended, (0, 0), max(1.0, diag * 0.0018))

    # Where the paper will show through, keyed on the tone BEFORE any lightening —
    # keying it after lifting turns most of the frame into grey mush.
    highlights = _luminance01(washes)

    # Transparent pigment: saturate first, then lift only gently. Lifting hard
    # before saturating is what washed the colour out of an earlier attempt.
    hsv = cv2.cvtColor(washes, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.75, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * 1.06 + 12, 0, 255)
    tinted = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)

    # Bare paper in the true highlights — the white gaps that read as watercolour.
    paper = np.array([255, 253, 247], np.float32)
    bare = np.clip((highlights - 0.78) / 0.17, 0, 1) ** 0.9
    out = tinted * (1.0 - bare[..., None]) + paper * bare[..., None]

    # Wet edges: pigment pools and dries darker along contours.
    edge = cv2.GaussianBlur(_edges(rgb, 40, 120).astype(np.float32) / 255.0, (0, 0), 1.8)
    out *= 1.0 - 0.34 * edge[..., None]

    # Watercolour rarely sits near-black over large areas — the paper keeps
    # bouncing light back through the pigment, so open the shadows up.
    out = 255.0 * np.power(np.clip(out / 255.0, 0, 1), 0.82)

    # Paper granulation: gentle low-frequency mottling, not per-pixel noise.
    rng = np.random.default_rng(11)
    seed = rng.random((max(1, height // 12), max(1, width // 12)), np.float32)
    upscaled = cv2.resize(seed, (width, height), interpolation=cv2.INTER_CUBIC)
    grain = cv2.GaussianBlur(upscaled, (0, 0), diag * 0.004)
    out *= 1.0 + 0.09 * (grain - 0.5)[..., None]

    washed: np.ndarray = np.clip(out, 0, 255).astype(np.uint8)
    return washed


# ---------------------------------------------------------------------------
# Comic / halftone
# ---------------------------------------------------------------------------


def _quantize(rgb: np.ndarray, colours: int) -> np.ndarray:
    """Flatten to a small palette with k-means (clean cel-shaded colour areas)."""
    samples = rgb.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 16, 1.0)
    k = min(colours, len(np.unique(samples, axis=0)))
    _, labels, centers = cv2.kmeans(  # type: ignore[call-overload]
        samples, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS
    )
    quantized: np.ndarray = centers[labels.flatten()].reshape(rgb.shape).astype(np.uint8)
    return quantized


def comic(rgb: np.ndarray) -> np.ndarray:
    """Cel-shaded comic art: bold flat colour, heavy ink, halftone accents.

    Flat colour + black linework is what makes a comic read as a comic; the
    Ben-Day dot screen is applied only as a shading accent in a narrow tonal
    band, otherwise a photo with large dark areas turns into grey dot mush.
    """
    height, width = rgb.shape[:2]
    diag = max(width, height)

    # Open up the tonal range (keep real blacks) then flatten into bold areas.
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    lab[..., 0] = cv2.normalize(  # type: ignore[call-overload]
        lab[..., 0], None, 26, 250, cv2.NORM_MINMAX
    )
    lifted = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

    smooth = cv2.bilateralFilter(lifted, 9, 110, 110)
    flat = _quantize(smooth, 10)
    hsv = cv2.cvtColor(flat, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.9, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * 1.06, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)

    # Halftone accent only in a narrow shading band.
    cell = max(5.0, diag * 0.011)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    freq = np.pi / cell
    screen = (np.sin(xx * freq) * np.sin(yy * freq) + 1.0) * 0.5
    lum = _luminance01(lifted)
    band = ((lum > 0.24) & (lum < 0.48)).astype(np.float32)
    dots = (lum < screen * 0.7 + 0.16).astype(np.float32) * band
    out *= 1.0 - 0.18 * dots[..., None]

    # Heavy ink outlines in comic-black (a touch blue, not dead black).
    ink = cv2.dilate(_edges(lifted, 55, 145), np.ones((2, 2), np.uint8))
    out[ink > 0] = (24, 20, 32)
    return np.clip(out, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Pixel art
# ---------------------------------------------------------------------------


def pixel_art(rgb: np.ndarray, target_width: int = 84, palette: int = 16) -> np.ndarray:
    """Retro indexed-colour sprite look: downsample, quantise palette, upscale hard.

    ``target_width`` is deliberately coarse (~84 px across): the styled frame is
    displayed a few hundred pixels wide, so finer grids stop reading as pixel art.
    """
    height, width = rgb.shape[:2]
    tw = min(target_width, width)
    th = max(1, round(height * tw / width))
    small = cv2.resize(rgb, (tw, th), interpolation=cv2.INTER_AREA)

    # Lift the tone a little so dark areas keep readable palette entries.
    lab = cv2.cvtColor(small, cv2.COLOR_RGB2LAB)
    lab[..., 0] = cv2.normalize(  # type: ignore[call-overload]
        lab[..., 0], None, 34, 252, cv2.NORM_MINMAX
    )
    small = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

    samples = small.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    k = min(palette, len(np.unique(samples, axis=0)))
    _, labels, centers = cv2.kmeans(  # type: ignore[call-overload]
        samples, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS
    )
    quantized = centers[labels.flatten()].reshape(small.shape).astype(np.uint8)

    # Punchy game-art palette.
    hsv = cv2.cvtColor(quantized, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.35, 0, 255)
    quantized = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    blocks: np.ndarray = cv2.resize(quantized, (width, height), interpolation=cv2.INTER_NEAREST)
    return blocks


# ---------------------------------------------------------------------------
# Low poly
# ---------------------------------------------------------------------------


def low_poly(rgb: np.ndarray, points: int = 1400) -> np.ndarray:
    """Flat-shaded Delaunay facets over feature points (cv2.Subdiv2D)."""
    height, width = rgb.shape[:2]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    # Feature points where detail lives, plus a jittered grid so flat areas
    # still get facets, plus the corners so triangles cover the whole frame.
    min_distance = max(4, int(max(width, height) * 0.008))
    corners = cv2.goodFeaturesToTrack(
        gray, maxCorners=points, qualityLevel=0.006, minDistance=min_distance
    )
    coords: list[tuple[float, float]] = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
    ]
    if corners is not None:
        coords += [(float(x), float(y)) for x, y in corners.reshape(-1, 2)]
    step = max(16, int(max(width, height) * 0.035))
    rng = np.random.default_rng(7)
    for gy in range(0, height, step):
        for gx in range(0, width, step):
            jx = min(width - 1, max(0, gx + int(rng.integers(-step // 3, step // 3))))
            jy = min(height - 1, max(0, gy + int(rng.integers(-step // 3, step // 3))))
            coords.append((float(jx), float(jy)))

    subdiv = cv2.Subdiv2D((0, 0, width, height))
    for point in coords:
        try:
            subdiv.insert(point)
        except cv2.error:  # duplicate/out-of-rect point
            continue

    out = np.zeros_like(rgb)
    for t in subdiv.getTriangleList():
        tri = np.array([[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]], np.float32)
        if np.any(tri < -1) or np.any(tri[:, 0] > width) or np.any(tri[:, 1] > height):
            continue
        cx = int(np.clip(tri[:, 0].mean(), 0, width - 1))
        cy = int(np.clip(tri[:, 1].mean(), 0, height - 1))
        colour = rgb[cy, cx].tolist()
        cv2.fillConvexPoly(out, tri.astype(np.int32), colour, lineType=cv2.LINE_AA)
    return out


# ---------------------------------------------------------------------------
# Neon colour grades
# ---------------------------------------------------------------------------


def cyberpunk(rgb: np.ndarray) -> np.ndarray:
    """Cyberpunk 2077 grade: acid yellow + electric cyan on near-black.

    The signature of that look is **yellow**, not pink: near-black shadows, electric
    cyan mid-tones and acid-yellow highlights, with magenta showing up only in the
    neon edge bloom. An earlier ramp ended in magenta, which made this read as a
    harder-contrast twin of :func:`vaporwave` instead of its own style.
    """
    lum = _luminance01(cv2.bilateralFilter(rgb, 7, 60, 60))
    lum = np.clip((lum - 0.5) * 1.5 + 0.44, 0, 1)  # hard contrast for neon punch
    graded = _gradient_map(
        lum,
        [
            (0.00, (4, 5, 16)),  # near-black indigo
            (0.22, (8, 42, 96)),  # deep circuit blue
            (0.44, (0, 178, 208)),  # electric cyan
            (0.64, (48, 214, 188)),  # cyan-teal bridge
            (0.84, (246, 202, 28)),  # acid yellow — the 2077 signature
            (1.00, (255, 246, 178)),  # blown-out yellow-white
        ],
    ).astype(np.float32)

    # Neon edge bloom in magenta + cyan, screen-blended so it glows.
    edges = cv2.dilate(_edges(rgb, 50, 150), np.ones((2, 2), np.uint8)).astype(np.float32) / 255.0
    glow = cv2.GaussianBlur(edges, (0, 0), 2.6)
    neon = np.stack([glow * 255, glow * 40, glow * 210], axis=-1)
    out = 255.0 - (255.0 - graded) * (255.0 - neon) / 255.0

    # Deepen the darks so the neon reads against true black, like the game's key art.
    out = 255.0 * np.power(np.clip(out / 255.0, 0, 1), 1.12)
    return np.clip(out, 0, 255).astype(np.uint8)


def vaporwave(rgb: np.ndarray) -> np.ndarray:
    """Retro 80s/90s grade: pastel pink/cyan ramp, scanlines, chromatic offset."""
    height, width = rgb.shape[:2]
    lum = _luminance01(rgb)
    graded = _gradient_map(
        lum,
        [
            (0.00, (36, 18, 72)),
            (0.28, (132, 44, 148)),
            (0.52, (242, 118, 190)),
            (0.74, (140, 226, 238)),
            (1.00, (250, 246, 214)),
        ],
    ).astype(np.float32)

    # Chromatic offset (VHS-style channel misregistration).
    shift = max(2, int(width * 0.0025))
    graded[..., 0] = np.roll(graded[..., 0], -shift, axis=1)
    graded[..., 2] = np.roll(graded[..., 2], shift, axis=1)

    # Scanlines + lifted blacks.
    scan = np.ones((height, 1), np.float32)
    scan[::3] = 0.88
    graded *= scan[..., None]
    graded = graded * 0.92 + 18.0
    return np.clip(graded, 0, 255).astype(np.uint8)


STYLE_FILTERS: dict[str, Callable[[np.ndarray], np.ndarray]] = {
    "ink_sketch": ink_sketch,
    "watercolor": watercolor,
    "comic": comic,
    "pixel_art": pixel_art,
    "low_poly": low_poly,
    "cyberpunk": cyberpunk,
    "vaporwave": vaporwave,
}
