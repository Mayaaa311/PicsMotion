#!/usr/bin/env python3
"""Reusable end-to-end scene pipeline: a folder of photos -> interactive scenes.

One command runs both stages the demo needs, on any folder of images:

  1. SEPARATE  each photo into depth layers (:func:`app.separate.separate_image`)
  2. STYLIZE   each scene into every art style (:func:`app.stylize.stylize_scene`);
               hosted styles route to GPT ``gpt-image-1`` when an OpenAI key is
               configured in ``apps/ai-service/.env`` (else the local engine).

Both stages are the SAME functions used by the gallery script, the upload path
and the ``/scenes/process`` endpoint -- there is no second copy of the logic.
Both are cached: separation is skipped when a scene's ``scene.json`` already
exists, and styling is skipped per-style by its ``.sha`` sidecar. Re-runs are
cheap and safe; only new or changed work runs.

Usage:
    python scripts/build-scenes.py                     # demo-photos -> gallery (+ yosemite styles)
    python scripts/build-scenes.py --src PATH          # any folder of .jpg/.png
    python scripts/build-scenes.py --limit N           # only the first N photos (cost control)
    python scripts/build-scenes.py --scene ID [ID...]  # only these scene ids
    python scripts/build-scenes.py --separate-only     # stage 1 only (no API cost)
    python scripts/build-scenes.py --styles-only       # stage 2 only (reuse existing layers)
    python scripts/build-scenes.py --styles a,b,c      # restrict to these style ids
    python scripts/build-scenes.py --dry-run           # plan only; generate nothing

Set ``AI_PROVIDER_MODE=mock`` in the environment to force the offline local
engine (no OpenAI calls) regardless of any key on disk -- useful for a free
dry run of the real pipeline.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "ai-service"))

from app.separate import separate_image  # noqa: E402
from app.stylize import stylize_scene  # noqa: E402
from models.styles import STYLE_CATALOG  # noqa: E402

DEMO_PHOTOS = ROOT / "apps" / "web" / "public" / "demo-photos"
SCENES = ROOT / "apps" / "web" / "public" / "scenes"
GALLERY = SCENES / "gallery"
PHOTO_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp")


def _yield_to_desktop() -> None:
    """Volunteer as the kernel's first OOM victim (Linux, best-effort).

    A long batch beside an interactive editor: raise our oom_score so memory
    pressure kills this resumable job instead of the desktop (see gen-styles.py).
    """
    try:
        Path("/proc/self/oom_score_adj").write_text("900", encoding="utf-8")
    except OSError:
        pass


def _discover_photos(src: Path, limit: int | None, only_ids: set[str] | None) -> list[Path]:
    """Return the source image files to process, filtered and ordered."""
    if not src.is_dir():
        raise SystemExit(f"source folder not found: {src}")
    photos = sorted(p for p in src.iterdir() if p.suffix.lower() in PHOTO_SUFFIXES)
    if only_ids is not None:
        photos = [p for p in photos if p.stem in only_ids]
    if limit is not None:
        photos = photos[:limit]
    return photos


def separate_all(photos: list[Path], *, force: bool, dry_run: bool) -> list[str]:
    """Stage 1 — separate each photo into a scene. Returns scene ids in order."""
    scene_ids: list[str] = []
    for photo in photos:
        scene_id = photo.stem
        scene_ids.append(scene_id)
        out_dir = GALLERY / scene_id
        if (out_dir / "scene.json").is_file() and not force:
            print(f"  [skip] separate {scene_id} (scene.json exists)")
            continue
        if dry_run:
            print(f"  [plan] separate {scene_id}")
            continue
        started = time.perf_counter()
        separate_image(photo.read_bytes(), str(out_dir), scene_id, f"Photo {scene_id}")
        print(f"  [done] separate {scene_id} ({time.perf_counter() - started:.1f}s)")
    return scene_ids


async def stylize_all(
    scene_dirs: list[Path], style_ids: list[str] | None, *, dry_run: bool
) -> None:
    """Stage 2 — stylize each scene (cached per-style by its .sha sidecar)."""
    for scene_dir in scene_dirs:
        if not (scene_dir / "scene.json").is_file():
            print(f"  [warn] no scene.json in {scene_dir.name}; run separation first")
            continue
        if dry_run:
            print(f"  [plan] stylize {scene_dir.name}")
            continue
        started = time.perf_counter()
        await stylize_scene(scene_dir, style_ids)
        print(f"  [done] stylize {scene_dir.name} ({time.perf_counter() - started:.1f}s)")


def rebuild_index(scene_ids: list[str]) -> None:
    """Rewrite gallery/index.json to exactly the given scenes, in order.

    Scoping the index to this run's scenes is what makes ``--src <folder>``
    mean "the gallery is these photos": a curated folder yields a curated
    gallery, without deleting other scene folders left on disk.
    """
    scenes: list[dict[str, object]] = []
    for scene_id in scene_ids:
        scene_path = GALLERY / scene_id / "scene.json"
        if not scene_path.is_file():
            continue
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        scenes.append(
            {
                "id": scene_id,
                "title": scene.get("title", f"Photo {scene_id}"),
                "preview": f"gallery/{scene_id}/preview.png",
                "aspect": scene.get("aspectRatio", 1.0),
            }
        )
    (GALLERY / "index.json").write_text(json.dumps({"scenes": scenes}, indent=2), encoding="utf-8")
    print(f"[index] {len(scenes)} scenes -> gallery/index.json")


def _parse_style_ids(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    ids = [s.strip() for s in raw.split(",") if s.strip()]
    unknown = [s for s in ids if s not in STYLE_CATALOG]
    if unknown:
        raise SystemExit(f"unknown style id(s): {', '.join(unknown)}")
    return ids


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--src", type=Path, default=DEMO_PHOTOS, help="folder of source photos")
    parser.add_argument("--limit", type=int, default=None, help="process only the first N photos")
    parser.add_argument("--scene", nargs="*", default=None, help="only these scene ids")
    parser.add_argument("--styles", default=None, help="comma-separated style ids (default: all)")
    parser.add_argument("--separate-only", action="store_true", help="stage 1 only")
    parser.add_argument("--styles-only", action="store_true", help="stage 2 only")
    parser.add_argument(
        "--force", action="store_true", help="re-separate even if scene.json exists"
    )
    parser.add_argument("--dry-run", action="store_true", help="plan only; generate nothing")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    _yield_to_desktop()
    only_ids = set(args.scene) if args.scene else None
    style_ids = _parse_style_ids(args.styles)

    photos = _discover_photos(args.src, args.limit, only_ids)
    if not photos:
        print(f"No photos found in {args.src}")
        return 1
    print(f"Pipeline over {len(photos)} photo(s) from {args.src}")

    if not args.styles_only:
        print("== Stage 1: separate ==")
        scene_ids = separate_all(photos, force=args.force, dry_run=args.dry_run)
    else:
        scene_ids = [p.stem for p in photos]

    if not args.separate_only:
        n_styles = len(style_ids) if style_ids else len(STYLE_CATALOG)
        print(f"== Stage 2: stylize ({n_styles} styles/scene) ==")
        scene_dirs = [GALLERY / sid for sid in scene_ids]
        asyncio.run(stylize_all(scene_dirs, style_ids, dry_run=args.dry_run))

    if not args.dry_run:
        rebuild_index(scene_ids)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
