"""Whole-image AI style-transfer CLI.

Usage:

    python -m app.stylize <sceneDir> [styleId ...]

``sceneDir`` is a path to a scene folder containing ``scene.json`` (see
``schemas/scene.py``). For each requested style (default: every style in
``STYLE_CATALOG``) this loads the scene's *original* photo, restyles the whole
frame once through the active :class:`~models.style_providers.StyleProvider`
(local ONNX fast-neural-style by default -- runs offline, no API keys), and
writes:

    <sceneDir>/styles/<styleId>.png
    <sceneDir>/styles/manifest.json

The web runtime reveals this single styled frame per layer (masked by each
layer's alpha and a cursor "paint" mask), so one run per style is enough --
no need to restyle each layer separately, which also avoids transparent-edge
artefacts at cutout borders.

Outputs are cached: a ``.sha`` sidecar records
``sha256(original_bytes + styleId + provider + model)``; a matching hash on a
later run skips regeneration. No model weights or long-running work happen as a
side effect of importing this module -- everything happens inside
:func:`stylize_scene`, invoked explicitly via the CLI.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.config import Settings, get_settings
from models.style_providers import StyleProvider, get_style_provider
from models.styles import STYLE_CATALOG, StyleSpec

_CACHE_SUFFIX = ".sha"
#: Bump when a style's *algorithm* changes. The cache key covers the source photo,
#: style id, provider and model name — none of which move when a filter's internals
#: are rewritten, so without this a reworked style would silently stay stale.
_PIPELINE_REVISION = "5"


def _style_model_label(provider: StyleProvider, style: StyleSpec) -> str:
    """Human/cache label for the engine a provider uses for one style."""
    if getattr(provider, "name", None) in {"local", "onnx", "filter"}:
        return style.model
    return getattr(provider, "name", "unknown")


def _cache_digest(original_bytes: bytes, style_id: str, provider: str, model: str) -> str:
    hasher = hashlib.sha256()
    hasher.update(original_bytes)
    for part in (style_id, provider, model, _PIPELINE_REVISION):
        hasher.update(b"\0")
        hasher.update(part.encode("utf-8"))
    return hasher.hexdigest()


def _resolve_styles(style_ids: list[str] | None) -> list[StyleSpec]:
    requested = style_ids if style_ids else list(STYLE_CATALOG.keys())
    styles: list[StyleSpec] = []
    for style_id in requested:
        spec = STYLE_CATALOG.get(style_id)
        if spec is None:
            known = ", ".join(sorted(STYLE_CATALOG))
            raise ValueError(f"unknown style id '{style_id}'; known styles: {known}")
        styles.append(spec)
    return styles


async def stylize_scene(
    scene_dir: Path,
    style_ids: list[str] | None = None,
    *,
    settings: Settings | None = None,
    provider: StyleProvider | None = None,
    generated_at: str | None = None,
) -> Path:
    """Restyle a scene's original photo into each requested whole-frame style.

    Returns the path to the written ``styles/manifest.json``.
    """
    resolved_settings = settings if settings is not None else get_settings()
    resolved_provider = (
        provider if provider is not None else get_style_provider(resolved_settings)
    )
    provider_name = getattr(resolved_provider, "name", "unknown")

    scene_path = scene_dir / "scene.json"
    scene_data = json.loads(scene_path.read_text(encoding="utf-8"))
    source_rel = scene_data.get("originalImageUrl") or scene_data.get("backgroundPlateUrl")
    if not source_rel:
        raise ValueError(f"scene {scene_path} has no originalImageUrl/backgroundPlateUrl")
    original_bytes = (scene_dir / source_rel).read_bytes()
    styles = _resolve_styles(style_ids)

    styles_dir = scene_dir / "styles"
    styles_dir.mkdir(parents=True, exist_ok=True)

    is_available = getattr(resolved_provider, "is_available", None)
    generated: list[StyleSpec] = []

    for style in styles:
        # Skip styles whose (git-ignored) weights are not installed rather than
        # failing the whole run — the algorithmic styles still generate.
        if is_available is not None and not is_available(style):
            print(f"[skip] {style.id}.png (no weights for '{style.model}')")
            continue
        generated.append(style)

        output_path = styles_dir / f"{style.id}.png"
        sha_path = output_path.with_name(output_path.name + _CACHE_SUFFIX)
        model = _style_model_label(resolved_provider, style)
        digest = _cache_digest(original_bytes, style.id, provider_name, model)

        if output_path.exists() and sha_path.exists():
            if sha_path.read_text(encoding="utf-8").strip() == digest:
                print(f"[skip] {style.id}.png (cached, {provider_name}/{model})")
                continue

        result_bytes = await resolved_provider.stylize(original_bytes, style)
        output_path.write_bytes(result_bytes)
        sha_path.write_text(digest, encoding="utf-8")
        print(f"[done] {style.id}.png ({provider_name}/{model})")

    manifest = {
        "generatedAt": generated_at or datetime.now(UTC).isoformat(),
        "provider": provider_name,
        "source": source_rel,
        "styles": [
            {
                "id": s.id,
                "displayName": s.display_name,
                "kind": s.kind,
                "model": _style_model_label(resolved_provider, s),
            }
            for s in generated
        ],
    }
    manifest_path = styles_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"[manifest] {manifest_path}")
    return manifest_path


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.stylize",
        description="Restyle a scene's original photo into one or more whole-frame art styles.",
    )
    parser.add_argument(
        "scene_dir",
        type=Path,
        help="Path to a scene folder containing scene.json.",
    )
    parser.add_argument(
        "style_ids",
        nargs="*",
        default=None,
        help=f"Style ids to generate (default: all of {', '.join(STYLE_CATALOG)}).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    asyncio.run(stylize_scene(args.scene_dir, args.style_ids or None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
