#!/usr/bin/env python3
"""Batch whole-image style transfer for the demo scenes.

Restyles the default Yosemite scene and every gallery scene into all four
local ONNX art styles (writes ``<scene>/styles/<id>.png`` + ``manifest.json``).
Outputs are git-ignored and cached; re-runs skip unchanged scenes.

Usage:
    python scripts/gen-styles.py            # yosemite + gallery
    python scripts/gen-styles.py <sceneDir> [<sceneDir> ...]
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

# Make the ai-service package importable (app/, models/, schemas/).
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "ai-service"))

from app.stylize import stylize_scene  # noqa: E402

SCENES = ROOT / "apps" / "web" / "public" / "scenes"


def _yield_to_desktop() -> None:
    """Volunteer as the kernel's first OOM victim (Linux only, best-effort).

    This is a long batch job running beside an interactive desktop. Electron
    tags its renderers with a raised oom_score_adj, so under memory pressure
    the kernel picks the editor over this script even when the script is the
    one holding the memory -- which is exactly how a run here once killed
    VS Code. Scoring ourselves higher inverts that: the resumable job dies,
    the editor survives.
    """
    try:
        Path("/proc/self/oom_score_adj").write_text("900", encoding="utf-8")
    except OSError:
        pass  # non-Linux, or a sandbox that forbids it -- not worth failing over


def _default_scene_dirs() -> list[Path]:
    dirs: list[Path] = []
    yosemite = SCENES / "yosemite-falls"
    if (yosemite / "scene.json").is_file():
        dirs.append(yosemite)
    gallery_index = SCENES / "gallery" / "index.json"
    if gallery_index.is_file():
        index = json.loads(gallery_index.read_text(encoding="utf-8"))
        for item in index.get("scenes", []):
            scene_dir = SCENES / "gallery" / item["id"]
            if (scene_dir / "scene.json").is_file():
                dirs.append(scene_dir)
    return dirs


async def _main(scene_dirs: list[Path]) -> None:
    for scene_dir in scene_dirs:
        started = time.perf_counter()
        await stylize_scene(scene_dir)
        elapsed = time.perf_counter() - started
        print(f"  {scene_dir.name}: {elapsed:.1f}s")


if __name__ == "__main__":
    _yield_to_desktop()
    args = [Path(a) for a in sys.argv[1:]] or _default_scene_dirs()
    if not args:
        print("No scenes found. Run scripts/gen-photo-scene.py / gen-gallery.py first.")
        raise SystemExit(1)
    print(f"Styling {len(args)} scene(s)…")
    asyncio.run(_main(args))
    print("Done.")
