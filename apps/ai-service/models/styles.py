"""Catalog of AI art-style presets for the cursor paintbrush.

Each :class:`StyleSpec` pairs a stable style id (used in CLI args, output
filenames, and URLs the web app depends on) with how the look is produced:

* ``kind="onnx"`` — a pretrained **fast-neural-style** model from the ONNX Model
  Zoo (Johnson et al.), run locally on CPU with no API keys. ``model`` names the
  weights file in ``apps/web/public/models/style/``. These give the painterly
  styles; the zoo ships five, of which four are used.
* ``kind="torch"`` — a pretrained Torch7 fast-neural-style net (Johnson et al.'s
  original released models), run through ``cv2.dnn``. This is where the true
  **Van Gogh / Starry Night** weights live; the ONNX Model Zoo has no Van Gogh.
* ``kind="anime"`` — AnimeGANv3, a GAN trained on anime film frames. The ``Hayao``
  weights are trained on Hayao Miyazaki's films, giving Ghibli-style backgrounds.
* ``kind="filter"`` — a published image-processing technique from
  :mod:`models.style_filters` (OpenCV's non-photorealistic-rendering module,
  Delaunay triangulation, palette quantisation, gradient-map grading). These
  cover the *graphic* styles that neural style transfer reproduces poorly.
  ``model`` names the function in ``STYLE_FILTERS``.

``prompt`` is only used by the hosted image-edit adapters (OpenAI / fal).

Styles are ordered painterly-first, and chosen to be maximally distinct from one
another — each should read instantly as a different medium, while still clearly
being the same photograph.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

StyleKind = Literal["onnx", "torch", "anime", "filter"]


@dataclass(frozen=True)
class StyleSpec:
    id: str
    display_name: str
    #: How the style is produced — pretrained network or algorithmic filter.
    kind: StyleKind
    #: ONNX weights name (kind="onnx") or STYLE_FILTERS key (kind="filter").
    model: str
    #: Text prompt for the hosted image-edit adapters (OpenAI / fal) fallback.
    prompt: str
    #: Keep the PHOTO's own colours and take only the style's brushwork.
    #: Style transfer moves texture *and* palette. For a style wanted purely for
    #: how it paints — Van Gogh's strokes rather than Starry Night's blue/yellow —
    #: that palette swap is wrong, so the stylised luminance is recombined with the
    #: original's chroma (Gatys et al., "Preserving Color in Neural Artistic
    #: Style Transfer"). Leave False where the palette IS the style (Cyberpunk,
    #: Vaporwave, Pop Art, Stained Glass).
    preserve_color: bool = False


def _spec(
    style_id: str,
    display_name: str,
    kind: StyleKind,
    model: str,
    prompt: str,
    *,
    preserve_color: bool = False,
) -> StyleSpec:
    return StyleSpec(
        id=style_id,
        display_name=display_name,
        kind=kind,
        model=model,
        prompt=prompt,
        preserve_color=preserve_color,
    )


STYLE_CATALOG: dict[str, StyleSpec] = {
    # --- Painterly: pretrained fast-neural-style networks -------------------
    "impressionist": _spec(
        "impressionist",
        "Impressionist",
        "onnx",
        "rain-princess",
        "vivid impressionist oil painting, thick palette-knife strokes, luminous "
        "orange and teal, Leonid Afremov",
    ),
    "van-gogh": _spec(
        "van-gogh",
        "Van Gogh",
        "torch",
        "starry_night",
        "Van Gogh swirling impasto brushstrokes, thick expressive directional "
        "paint, heavy visible texture",
        # Brushwork only — Starry Night's blue/yellow palette must not be painted
        # over every photo.
        preserve_color=True,
    ),
    "miyazaki": _spec(
        "miyazaki",
        "Miyazaki",
        "anime",
        "AnimeGANv3_Hayao_36",
        "Studio Ghibli background painting, Hayao Miyazaki, lush painted foliage, "
        "soft luminous skies, hand-painted anime film cel",
    ),
    "stained-glass": _spec(
        "stained-glass",
        "Stained Glass",
        "onnx",
        "mosaic",
        "stained glass mosaic, bold black leaded outlines, luminous translucent "
        "colour panes, geometric tessellation",
    ),
    "pop-art": _spec(
        "pop-art",
        "Pop Art",
        "onnx",
        "candy",
        "pop-art screenprint, high-contrast flat bold saturated colour blocks, "
        "warm candy palette",
    ),
    "cubist": _spec(
        "cubist",
        "Cubist",
        "onnx",
        "udnie",
        "cubo-futurist painting, faceted overlapping planes, muted palette, "
        "Francis Picabia Udnie",
    ),
    # --- Graphic: published algorithmic techniques --------------------------
    "watercolor": _spec(
        "watercolor",
        "Watercolour",
        "filter",
        "watercolor",
        "loose watercolour painting, soft translucent washes, cold-press paper",
    ),
    "ink-sketch": _spec(
        "ink-sketch",
        "Ink Sketch",
        "filter",
        "ink_sketch",
        "black and white ink pen sketch, bold confident linework, cross-hatching",
    ),
    "comic": _spec(
        "comic",
        "Comic",
        "filter",
        "comic",
        "comic book art, Ben-Day halftone dots, heavy black ink outlines, flat "
        "cel-shaded CMYK colour",
    ),
    "pixel-art": _spec(
        "pixel-art",
        "Pixel Art",
        "filter",
        "pixel_art",
        "retro 16-bit pixel art, limited indexed palette, chunky square pixels",
    ),
    "low-poly": _spec(
        "low-poly",
        "Low Poly",
        "filter",
        "low_poly",
        "low-poly vector illustration, flat shaded geometric triangular facets",
    ),
    "cyberpunk": _spec(
        "cyberpunk",
        "Cyberpunk",
        "filter",
        "cyberpunk",
        "cyberpunk neon dystopia, teal and magenta glow, high-tech night city",
    ),
    "vaporwave": _spec(
        "vaporwave",
        "Vaporwave",
        "filter",
        "vaporwave",
        "vaporwave aesthetic, pastel pink and cyan, VHS scanlines, retro 80s digital",
    ),
}
