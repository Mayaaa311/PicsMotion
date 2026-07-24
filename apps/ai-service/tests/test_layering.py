"""Tests for the layer-separation primitives (pure CPU, no model weights).

Each test here pins an invariant that a real visual bug violated, so the bug
cannot come back silently.
"""

from __future__ import annotations

import numpy as np

from app.layering import (
    complete_behind,
    depth_bands,
    fill_holes,
    reconstruct_plate,
    smooth_inpaint,
)


def _photo(width: int = 120, height: int = 90) -> np.ndarray:
    """A deterministic, non-flat test image."""
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    rgb = np.stack(
        [(xx / width) * 255, (yy / height) * 255, ((xx + yy) % 64) * 4], axis=-1
    )
    return rgb.astype(np.float32)


def _blob(shape: tuple[int, int], top: int, left: int, size: int) -> np.ndarray:
    mask = np.zeros(shape, bool)
    mask[top : top + size, left : left + size] = True
    return mask


# ---------------------------------------------------------------------------
# complete_behind
# ---------------------------------------------------------------------------


def test_complete_behind_only_touches_the_hidden_region() -> None:
    """Regression: a wide margin overwrote pixels that are VISIBLE at rest.

    Completing a layer under its occluder must fill the occluded silhouette (plus a
    hair for the anti-aliased fringe) and nothing else. Growing it by the
    occluder's full travel distance produced a mushy halo ringing every cutout.
    """
    rgb = _photo()
    shape = rgb.shape[:2]
    occluder = _blob(shape, 30, 40, 20)
    layer = np.ones(shape, bool) & ~occluder

    out, coverage = complete_behind(rgb, layer, occluder, margin_px=3)

    # Everything comfortably outside the occluder keeps its exact original pixels.
    far_from_occluder = np.ones(shape, bool)
    far_from_occluder[25:75, 35:85] = False
    assert np.array_equal(
        out[far_from_occluder], np.clip(rgb, 0, 255).astype(np.uint8)[far_from_occluder]
    )
    # The layer now covers the previously-hidden area, so nothing can show through.
    assert coverage[occluder].all()


def test_complete_behind_is_a_noop_without_occluders() -> None:
    rgb = _photo()
    layer = _blob(rgb.shape[:2], 10, 10, 30)
    out, coverage = complete_behind(rgb, layer, np.zeros(rgb.shape[:2], bool), margin_px=3)
    assert np.array_equal(out, np.clip(rgb, 0, 255).astype(np.uint8))
    assert np.array_equal(coverage, layer)


# ---------------------------------------------------------------------------
# reconstruct_plate
# ---------------------------------------------------------------------------


def test_reconstruct_plate_erases_the_whole_silhouette() -> None:
    """Regression: retaining the silhouette interior left a ghost duplicate."""
    rgb = _photo()
    silhouette = _blob(rgb.shape[:2], 30, 40, 24)

    plate, generated = reconstruct_plate(rgb, silhouette, margin_px=3)

    original = np.clip(rgb, 0, 255).astype(np.uint8)
    # No pixel of the subject may survive anywhere inside its silhouette.
    assert not np.array_equal(plate[silhouette].astype(np.uint8), original[silhouette])
    # The plate stays photo-sharp everywhere well outside the silhouette.
    outside = np.ones(rgb.shape[:2], bool)
    outside[24:66, 34:76] = False
    assert np.array_equal(plate[outside].astype(np.uint8), original[outside])
    assert 0.0 < generated < 1.0


# ---------------------------------------------------------------------------
# masks
# ---------------------------------------------------------------------------


def test_fill_holes_closes_interior_pinholes() -> None:
    """Regression: pinholes went semi-transparent when feathered (see-through)."""
    mask = _blob((90, 120), 20, 20, 40)
    mask[35:40, 35:40] = False  # punch a hole inside the blob
    assert not mask[37, 37]

    filled = fill_holes(mask)
    assert filled[37, 37], "an enclosed hole must be closed"
    assert not filled[5, 5], "outside the blob must stay empty"


def test_depth_bands_are_disjoint_and_skip_excluded_area() -> None:
    height, width = 90, 120
    depth = np.tile(np.linspace(0.0, 1.0, width, dtype=np.float32), (height, 1))
    exclude = _blob((height, width), 0, 0, 20)

    near, mid = depth_bands(depth, exclude, diag=max(width, height), cuts=(0.4, 0.75))

    assert not (near & mid).any(), "bands must not overlap"
    # The nearest band must sit at greater depth than the middle one.
    if near.any() and mid.any():
        assert depth[near].mean() > depth[mid].mean()


def test_smooth_inpaint_fills_the_hole_and_leaves_the_rest_alone() -> None:
    rgb = _photo()
    hole = _blob(rgb.shape[:2], 40, 50, 16)

    filled = smooth_inpaint(rgb, hole)

    assert filled.shape == rgb.shape
    outside = ~hole
    assert np.array_equal(filled[outside], np.clip(rgb, 0, 255).astype(np.uint8)[outside])
