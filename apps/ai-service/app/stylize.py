"""Per-layer AI style-transfer CLI.

Usage:

    python -m app.stylize <sceneDir> [styleId ...]

``sceneDir`` is a path to a scene folder containing ``scene.json`` and a
``layers/`` directory (see ``schemas/scene.py``). For each requested style
(default: every style in ``STYLE_CATALOG``) and each layer referenced by
``scene.json``, this loads the layer PNG, restyles it through the active
:class:`~models.style_providers.StyleProvider` (mock by default -- runs
fully offline), and writes:

    <sceneDir>/styles/<styleId>/<layerId>.png
    <sceneDir>/styles/manifest.json

Outputs are cached: a ``.sha`` sidecar next to each output records
``sha256(input_bytes + styleId + model)``; a matching hash on a later run
skips regeneration. No model weights or long-running work happens as a side
effect of importing this module -- everything happens inside
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
from schemas.scene import parse_scene_document

_CACHE_SUFFIX = ".sha"


def _active_provider_name(settings: Settings) -> str:
    """Best-effort label for the provider ``get_style_provider`` will pick."""
    if settings.is_mock_mode:
        return "mock"
    if settings.openai_api_key:
        return "openai"
    if settings.fal_key:
        return "fal"
    return "mock"


def _active_model_name(settings: Settings, provider_name: str) -> str:
    if provider_name == "openai":
        return settings.openai_image_model
    if provider_name == "fal":
        return settings.fal_style_model
    return "mock"


def _cache_digest(input_bytes: bytes, style_id: str, model: str) -> str:
    hasher = hashlib.sha256()
    hasher.update(input_bytes)
    hasher.update(b"\0")
    hasher.update(style_id.encode("utf-8"))
    hasher.update(b"\0")
    hasher.update(model.encode("utf-8"))
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
    """Restyle every layer in ``scene_dir`` for each requested style.

    Returns the path to the written ``styles/manifest.json``.
    """
    resolved_settings = settings if settings is not None else get_settings()
    resolved_provider = (
        provider if provider is not None else get_style_provider(resolved_settings)
    )
    provider_name = _active_provider_name(resolved_settings)
    model = _active_model_name(resolved_settings, provider_name)

    scene_path = scene_dir / "scene.json"
    scene_data = json.loads(scene_path.read_text(encoding="utf-8"))
    scene = parse_scene_document(scene_data)
    styles = _resolve_styles(style_ids)

    styles_dir = scene_dir / "styles"
    styles_dir.mkdir(parents=True, exist_ok=True)

    for style in styles:
        style_dir = styles_dir / style.id
        style_dir.mkdir(parents=True, exist_ok=True)
        for layer in scene.layers:
            input_path = scene_dir / layer.asset_url
            output_path = style_dir / f"{layer.id}.png"
            sha_path = output_path.with_name(output_path.name + _CACHE_SUFFIX)

            input_bytes = input_path.read_bytes()
            digest = _cache_digest(input_bytes, style.id, model)

            if output_path.exists() and sha_path.exists():
                if sha_path.read_text(encoding="utf-8").strip() == digest:
                    print(f"[skip] {style.id}/{layer.id}.png (cached, {model})")
                    continue

            result_bytes = await resolved_provider.stylize(input_bytes, style)
            output_path.write_bytes(result_bytes)
            sha_path.write_text(digest, encoding="utf-8")
            print(f"[done] {style.id}/{layer.id}.png ({provider_name}/{model})")

    manifest = {
        "generatedAt": generated_at or datetime.now(UTC).isoformat(),
        "provider": provider_name,
        "model": model,
        "styles": [{"id": s.id, "displayName": s.display_name} for s in styles],
        "layers": [layer.id for layer in scene.layers],
    }
    manifest_path = styles_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"[manifest] {manifest_path}")
    return manifest_path


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.stylize",
        description="Restyle every layer PNG in a scene directory into one or more art styles.",
    )
    parser.add_argument(
        "scene_dir",
        type=Path,
        help="Path to a scene folder containing scene.json and layers/.",
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
