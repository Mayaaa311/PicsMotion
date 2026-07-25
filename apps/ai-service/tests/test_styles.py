"""Offline tests for the whole-image AI style-transfer pipeline.

No test in this module makes a real network call: the algorithmic filter provider is pure
OpenCV/Pillow, the OpenAI contract test swaps in an ``httpx.MockTransport``, and the
ONNX inference test is skipped unless the (git-ignored) local models are
present.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
from pathlib import Path

import httpx
import pytest
from PIL import Image

from app.config import Settings
from app.stylize import stylize_scene
from models.style_providers import (
    FilterStyleProvider,
    LocalStyleProvider,
    OnnxStyleProvider,
    OpenAIImageStyleProvider,
)
from models.styles import STYLE_CATALOG

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_png_bytes(size: tuple[int, int] = (8, 8)) -> bytes:
    """A small RGBA PNG with varied color and a non-trivial alpha channel."""
    width, height = size
    image = Image.new("RGBA", (width, height))
    pixels = image.load()
    assert pixels is not None
    for y in range(height):
        for x in range(width):
            pixels[x, y] = (
                (x * 30) % 256,
                (y * 40) % 256,
                (x + y) * 10 % 256,
                0 if (x + y) % 3 == 0 else 255,  # punch some fully transparent pixels
            )
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _build_scene_dict() -> dict[str, object]:
    """A minimal, fully valid single-layer SceneDocument dict."""
    layer = {
        "id": "plate",
        "name": "Plate",
        "semanticLabel": "scene",
        "role": "background",
        "assetUrl": "layers/plate.png",
        "bounds": {"x": 0, "y": 0, "width": 1, "height": 1},
        "anchor": {"x": 0.5, "y": 0.5},
        "depth": 0.5,
        "depthVariance": 0.1,
        "baseScale": 1.0,
        "baseRotation": 0,
        "baseOpacity": 1,
        "movement": {
            "enabled": False,
            "maxOffsetX": 0,
            "maxOffsetY": 0,
            "maxOffsetZ": 0,
            "maxRotation": 0,
            "parallaxStrength": 0,
            "dragEnabled": False,
            "returnMode": "fixed",
        },
        "interactionTags": [],
        "materialTags": [],
        "audioSensitivity": {
            "bass": 0,
            "lowMid": 0,
            "highMid": 0,
            "treble": 0,
            "beat": 0,
            "loudness": 0,
        },
        "importance": 0.5,
        "locked": False,
        "revealBudget": {"maxOffsetX": 0, "maxOffsetY": 0, "confidence": 1},
        "provenance": {"visiblePixels": "original", "sourceImageHash": "hash-plate"},
    }
    return {
        "version": "1.0",
        "id": "tiny-test-scene",
        "title": "Tiny Test Scene",
        "width": 8,
        "height": 8,
        "aspectRatio": 1.0,
        "originalImageUrl": "original/normalized.png",
        "backgroundPlateUrl": "background.png",
        "preset": "soft-nature",
        "visualAnalysis": {"sceneType": "test", "mainSubject": "test-subject"},
        "layers": [layer],
        "atmosphere": {},
        "camera": {},
        "metadata": {"createdAt": "2026-01-01T00:00:00Z", "pipelineVersion": "test"},
    }


def _write_tiny_scene(scene_dir: Path) -> None:
    (scene_dir / "layers").mkdir(parents=True)
    (scene_dir / "original").mkdir(parents=True)
    (scene_dir / "layers" / "plate.png").write_bytes(_make_png_bytes())
    # The original photo (what whole-image stylization reads) is opaque RGB.
    original = Image.open(io.BytesIO(_make_png_bytes((12, 12)))).convert("RGB")
    original.save(scene_dir / "original" / "normalized.png")
    (scene_dir / "scene.json").write_text(json.dumps(_build_scene_dict()), encoding="utf-8")


# ---------------------------------------------------------------------------
# FilterStyleProvider (algorithmic styles — always available, fully offline)
# ---------------------------------------------------------------------------

FILTER_STYLES = [s for s in STYLE_CATALOG.values() if s.kind == "filter"]
ONNX_STYLES = [s for s in STYLE_CATALOG.values() if s.kind == "onnx"]


async def test_filter_provider_preserves_size_and_alpha() -> None:
    original_bytes = _make_png_bytes((64, 48))
    original = Image.open(io.BytesIO(original_bytes)).convert("RGBA")

    provider = FilterStyleProvider()
    result_bytes = await provider.stylize(original_bytes, STYLE_CATALOG["comic"])
    result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")

    assert result.size == original.size
    assert result.getchannel("A").tobytes() == original.getchannel("A").tobytes()


async def test_filter_provider_covers_every_filter_style() -> None:
    """Every filter style must be implemented and look different from the others."""
    original_bytes = _make_png_bytes((64, 48))
    provider = FilterStyleProvider()
    outputs = {s.id: await provider.stylize(original_bytes, s) for s in FILTER_STYLES}

    assert len(outputs) == len(FILTER_STYLES)
    assert len(set(outputs.values())) == len(FILTER_STYLES)


async def test_filter_provider_rejects_unknown_filter() -> None:
    from dataclasses import replace

    bad = replace(STYLE_CATALOG["comic"], model="not_a_filter")
    with pytest.raises(ValueError, match="no filter"):
        await FilterStyleProvider().stylize(_make_png_bytes((16, 16)), bad)


# ---------------------------------------------------------------------------
# LocalStyleProvider (routes each style to its own engine)
# ---------------------------------------------------------------------------


def test_local_provider_availability_by_kind(tmp_path: Path) -> None:
    """Filter styles always work; weight-backed styles need their files installed."""
    settings = Settings(
        ai_provider_mode="mock",
        style_models_dir=str(tmp_path),
        anime_models_dir=str(tmp_path),
    )
    provider = LocalStyleProvider(settings)

    assert all(provider.is_available(s) for s in FILTER_STYLES)
    weighted = [s for s in STYLE_CATALOG.values() if s.kind != "filter"]
    assert weighted, "the catalogue should have weight-backed styles"
    assert not any(provider.is_available(s) for s in weighted)


def test_every_catalog_style_has_a_known_engine() -> None:
    """A style whose kind no engine handles would silently fall back to a filter."""
    engines = {"onnx", "torch", "anime", "filter"}
    for spec in STYLE_CATALOG.values():
        assert spec.kind in engines, f"{spec.id} has unknown kind {spec.kind}"
        assert spec.model, f"{spec.id} must name its weights/filter"

    # Ids and display names must be unique — both are user-facing keys.
    ids = [s.id for s in STYLE_CATALOG.values()]
    names = [s.display_name for s in STYLE_CATALOG.values()]
    assert len(set(ids)) == len(ids)
    assert len(set(names)) == len(names)
    # Every catalogue key must match its spec's id (the web app indexes by key).
    assert all(key == spec.id for key, spec in STYLE_CATALOG.items())


# ---------------------------------------------------------------------------
# OnnxStyleProvider (local, offline; inference skipped when models absent)
# ---------------------------------------------------------------------------


def test_onnx_provider_reports_availability(tmp_path: Path) -> None:
    settings = Settings(ai_provider_mode="mock", style_models_dir=str(tmp_path))
    provider = OnnxStyleProvider(settings)
    style = STYLE_CATALOG["stained-glass"]

    assert provider.is_available(style) is False
    provider.model_path(style).write_bytes(b"not-a-real-model")
    assert provider.is_available(style) is True


async def test_onnx_provider_stylizes_and_preserves_alpha() -> None:
    """Runs a real ONNX model when the git-ignored weights are present."""
    settings = Settings(ai_provider_mode="mock", style_max_size=128)
    provider = OnnxStyleProvider(settings)
    style = STYLE_CATALOG["stained-glass"]
    if not provider.is_available(style):
        pytest.skip("ONNX style models not installed (run scripts/prep-style-models.py)")

    original_bytes = _make_png_bytes((48, 32))
    original = Image.open(io.BytesIO(original_bytes)).convert("RGBA")
    result_bytes = await provider.stylize(original_bytes, style)
    result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")

    assert result.size == original.size
    assert result.getchannel("A").tobytes() == original.getchannel("A").tobytes()
    # A real restyle must actually change the RGB content.
    assert result.convert("RGB").tobytes() != original.convert("RGB").tobytes()


# ---------------------------------------------------------------------------
# OpenAIImageStyleProvider contract test (mocked transport, no real network)
# ---------------------------------------------------------------------------


async def test_openai_provider_posts_to_images_edits_and_reapplies_alpha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_bytes = _make_png_bytes((4, 4))
    original = Image.open(io.BytesIO(original_bytes)).convert("RGBA")

    mocked_result = Image.new("RGB", (4, 4), (200, 100, 50))
    mocked_buffer = io.BytesIO()
    mocked_result.save(mocked_buffer, format="PNG")
    mocked_b64 = base64.b64encode(mocked_buffer.getvalue()).decode("ascii")

    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["content"] = request.content
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"data": [{"b64_json": mocked_b64}]})

    transport = httpx.MockTransport(handler)

    class _PatchedAsyncClient(httpx.AsyncClient):
        def __init__(self, *args: object, **kwargs: object) -> None:
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(httpx, "AsyncClient", _PatchedAsyncClient)

    settings = Settings(
        ai_provider_mode="live",
        openai_api_key="sk-test-key",
        openai_image_model="gpt-image-test-model",
    )
    provider = OpenAIImageStyleProvider(settings)
    style = STYLE_CATALOG["cubist"]

    result_bytes = await provider.stylize(original_bytes, style)

    assert captured["method"] == "POST"
    assert str(captured["url"]).endswith("/v1/images/edits")
    assert captured["auth"] == "Bearer sk-test-key"
    body = captured["content"]
    assert isinstance(body, bytes)
    assert b"gpt-image-test-model" in body
    assert style.prompt.encode("utf-8") in body
    assert b'filename="photo.png"' in body

    result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
    assert result.size == original.size
    # The alpha channel must come back from the *original* image, not OpenAI.
    assert result.getchannel("A").tobytes() == original.getchannel("A").tobytes()


def test_openai_provider_requires_api_key() -> None:
    settings = Settings(ai_provider_mode="live", openai_api_key=None)
    with pytest.raises(RuntimeError):
        OpenAIImageStyleProvider(settings)


# ---------------------------------------------------------------------------
# app.stylize CLI module (whole-image, provider injected for determinism)
# ---------------------------------------------------------------------------


async def test_stylize_scene_writes_outputs_and_manifest(tmp_path: Path) -> None:
    scene_dir = tmp_path / "scene"
    _write_tiny_scene(scene_dir)

    manifest_path = await stylize_scene(
        scene_dir,
        ["comic", "pixel-art"],
        provider=FilterStyleProvider(),
        generated_at="2026-01-01T00:00:00+00:00",
    )

    assert manifest_path == scene_dir / "styles" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["provider"] == "filter"
    assert manifest["source"] == "original/normalized.png"
    assert manifest["generatedAt"] == "2026-01-01T00:00:00+00:00"
    assert {s["id"] for s in manifest["styles"]} == {"comic", "pixel-art"}

    original = Image.open(scene_dir / "original" / "normalized.png")
    for style_id in ("comic", "pixel-art"):
        output = scene_dir / "styles" / f"{style_id}.png"
        assert output.exists()
        assert output.with_name(output.name + ".sha").exists()
        # One styled frame per style, matching the original photo's size.
        assert Image.open(output).size == original.size


async def test_stylize_scene_caches_and_skips_regeneration(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    scene_dir = tmp_path / "scene"
    _write_tiny_scene(scene_dir)

    await stylize_scene(scene_dir, ["comic"], provider=FilterStyleProvider())
    capsys.readouterr()  # discard first-run output

    output = scene_dir / "styles" / "comic.png"
    bytes_before = output.read_bytes()

    await stylize_scene(scene_dir, ["comic"], provider=FilterStyleProvider())
    captured = capsys.readouterr()

    assert bytes_before == output.read_bytes()
    assert captured.out.count("[skip]") == 1
    assert "[done]" not in captured.out


def test_stylize_scene_rejects_unknown_style(tmp_path: Path) -> None:
    scene_dir = tmp_path / "scene"
    _write_tiny_scene(scene_dir)

    with pytest.raises(ValueError, match="unknown style id"):
        asyncio.run(
            stylize_scene(scene_dir, ["not-a-real-style"], provider=FilterStyleProvider())
        )
