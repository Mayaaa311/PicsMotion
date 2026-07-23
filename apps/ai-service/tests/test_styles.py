"""Offline tests for the per-layer AI style-transfer pipeline.

No test in this module makes a real network call: the mock provider is pure
Pillow, and the OpenAI contract test swaps in an ``httpx.MockTransport``.
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
from models.style_providers import MockStyleProvider, OpenAIImageStyleProvider
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


def _layer_dict(layer_id: str, asset_url: str) -> dict[str, object]:
    """A minimal, fully valid SceneLayer dict (see schemas/scene.py)."""
    return {
        "id": layer_id,
        "name": layer_id.title(),
        "semanticLabel": layer_id,
        "role": "midground",
        "assetUrl": asset_url,
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
        "provenance": {"visiblePixels": "original", "sourceImageHash": f"hash-{layer_id}"},
    }


def _build_scene_dict(layers: list[dict[str, object]]) -> dict[str, object]:
    """A minimal, fully valid SceneDocument dict with the given layers."""
    return {
        "version": "1.0",
        "id": "tiny-test-scene",
        "title": "Tiny Test Scene",
        "width": 8,
        "height": 8,
        "aspectRatio": 1.0,
        "originalImageUrl": "original.png",
        "backgroundPlateUrl": "background.png",
        "preset": "soft-nature",
        "visualAnalysis": {"sceneType": "test", "mainSubject": "test-subject"},
        "layers": layers,
        "atmosphere": {},
        "camera": {},
        "metadata": {"createdAt": "2026-01-01T00:00:00Z", "pipelineVersion": "test"},
    }


def _write_tiny_scene(scene_dir: Path) -> None:
    layers_dir = scene_dir / "layers"
    layers_dir.mkdir(parents=True)
    (layers_dir / "a.png").write_bytes(_make_png_bytes())
    (layers_dir / "b.png").write_bytes(_make_png_bytes((6, 10)))
    scene = _build_scene_dict(
        [
            _layer_dict("a", "layers/a.png"),
            _layer_dict("b", "layers/b.png"),
        ]
    )
    (scene_dir / "scene.json").write_text(json.dumps(scene), encoding="utf-8")


# ---------------------------------------------------------------------------
# MockStyleProvider
# ---------------------------------------------------------------------------


async def test_mock_provider_preserves_size_and_alpha() -> None:
    original_bytes = _make_png_bytes((10, 6))
    original = Image.open(io.BytesIO(original_bytes)).convert("RGBA")

    provider = MockStyleProvider()
    result_bytes = await provider.stylize(original_bytes, STYLE_CATALOG["watercolor"])
    result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")

    assert result.size == original.size
    assert result.getchannel("A").tobytes() == original.getchannel("A").tobytes()


async def test_mock_provider_differs_between_styles() -> None:
    original_bytes = _make_png_bytes()
    provider = MockStyleProvider()

    spiderverse_bytes = await provider.stylize(original_bytes, STYLE_CATALOG["spiderverse"])
    oil_bytes = await provider.stylize(original_bytes, STYLE_CATALOG["oil"])

    assert spiderverse_bytes != oil_bytes

    spiderverse_alpha = Image.open(io.BytesIO(spiderverse_bytes)).convert("RGBA").getchannel("A")
    oil_alpha = Image.open(io.BytesIO(oil_bytes)).convert("RGBA").getchannel("A")
    # Both still preserve the same alpha channel even though RGB content differs.
    assert spiderverse_alpha.tobytes() == oil_alpha.tobytes()


async def test_mock_provider_covers_every_catalog_style() -> None:
    original_bytes = _make_png_bytes()
    provider = MockStyleProvider()
    outputs = {
        style_id: await provider.stylize(original_bytes, spec)
        for style_id, spec in STYLE_CATALOG.items()
    }
    # Every style must be implemented and produce a distinct result.
    assert len(outputs) == len(STYLE_CATALOG)
    assert len({v for v in outputs.values()}) == len(STYLE_CATALOG)


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
    style = STYLE_CATALOG["ink-sketch"]

    result_bytes = await provider.stylize(original_bytes, style)

    assert captured["method"] == "POST"
    assert str(captured["url"]).endswith("/v1/images/edits")
    assert captured["auth"] == "Bearer sk-test-key"
    body = captured["content"]
    assert isinstance(body, bytes)
    assert b"gpt-image-test-model" in body
    assert style.prompt.encode("utf-8") in body
    assert b'filename="layer.png"' in body

    result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
    assert result.size == original.size
    # The alpha channel must come back from the *original* layer, not OpenAI.
    assert result.getchannel("A").tobytes() == original.getchannel("A").tobytes()


def test_openai_provider_requires_api_key() -> None:
    settings = Settings(ai_provider_mode="live", openai_api_key=None)
    with pytest.raises(RuntimeError):
        OpenAIImageStyleProvider(settings)


# ---------------------------------------------------------------------------
# app.stylize CLI module
# ---------------------------------------------------------------------------


async def test_stylize_scene_writes_outputs_and_manifest(tmp_path: Path) -> None:
    scene_dir = tmp_path / "scene"
    _write_tiny_scene(scene_dir)
    settings = Settings(ai_provider_mode="mock")

    manifest_path = await stylize_scene(
        scene_dir,
        ["ink-sketch", "oil"],
        settings=settings,
        generated_at="2026-01-01T00:00:00+00:00",
    )

    assert manifest_path == scene_dir / "styles" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["provider"] == "mock"
    assert manifest["model"] == "mock"
    assert manifest["generatedAt"] == "2026-01-01T00:00:00+00:00"
    assert {s["id"] for s in manifest["styles"]} == {"ink-sketch", "oil"}
    assert set(manifest["layers"]) == {"a", "b"}

    for style_id in ("ink-sketch", "oil"):
        for layer_id in ("a", "b"):
            output = scene_dir / "styles" / style_id / f"{layer_id}.png"
            assert output.exists()
            sha = output.with_name(output.name + ".sha")
            assert sha.exists()
            # Written output must round-trip as a valid PNG with matching size.
            source = Image.open(scene_dir / "layers" / f"{layer_id}.png")
            restyled = Image.open(output)
            assert restyled.size == source.size


async def test_stylize_scene_caches_and_skips_regeneration(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    scene_dir = tmp_path / "scene"
    _write_tiny_scene(scene_dir)
    settings = Settings(ai_provider_mode="mock")

    await stylize_scene(scene_dir, ["oil"], settings=settings)
    capsys.readouterr()  # discard first-run output

    output_a = scene_dir / "styles" / "oil" / "a.png"
    output_b = scene_dir / "styles" / "oil" / "b.png"
    bytes_before = (output_a.read_bytes(), output_b.read_bytes())

    await stylize_scene(scene_dir, ["oil"], settings=settings)
    captured = capsys.readouterr()

    assert bytes_before == (output_a.read_bytes(), output_b.read_bytes())
    assert captured.out.count("[skip]") == 2
    assert "[done]" not in captured.out


def test_stylize_scene_rejects_unknown_style(tmp_path: Path) -> None:
    scene_dir = tmp_path / "scene"
    _write_tiny_scene(scene_dir)
    settings = Settings(ai_provider_mode="mock")

    with pytest.raises(ValueError, match="unknown style id"):
        asyncio.run(stylize_scene(scene_dir, ["not-a-real-style"], settings=settings))
