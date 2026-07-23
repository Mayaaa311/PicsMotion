"""Catalog of AI style-transfer presets.

Each :class:`StyleSpec` pairs a stable style id (used in CLI args, output
directory names, and URLs the web app depends on) with a strong,
provider-agnostic text prompt suitable for either an image-edit API or a
local mock transform.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StyleSpec:
    id: str
    display_name: str
    prompt: str


STYLE_CATALOG: dict[str, StyleSpec] = {
    "spiderverse": StyleSpec(
        id="spiderverse",
        display_name="Spider-Verse Comic",
        prompt=(
            "Into-the-Spider-Verse comic book art: bold Ben-Day halftone dots, "
            "heavy black ink outlines, flat cel-shaded CMYK colors, offset color "
            "registration, dynamic pop-art panel"
        ),
    ),
    "watercolor": StyleSpec(
        id="watercolor",
        display_name="Watercolor Painting",
        prompt=(
            "loose watercolor painting, soft translucent washes, visible "
            "cold-press paper texture, gentle pigment bleeds"
        ),
    ),
    "ink-sketch": StyleSpec(
        id="ink-sketch",
        display_name="Ink Sketch",
        prompt=(
            "black and white ink pen sketch, bold confident linework, "
            "cross-hatching, high contrast, minimal tone"
        ),
    ),
    "pop-art": StyleSpec(
        id="pop-art",
        display_name="Pop Art",
        prompt=(
            "Warhol pop-art screenprint, high-contrast flat bold saturated "
            "color blocks, halftone"
        ),
    ),
    "oil": StyleSpec(
        id="oil",
        display_name="Oil Painting",
        prompt=(
            "thick impasto oil painting, visible directional brush strokes, "
            "rich saturated color"
        ),
    ),
}
