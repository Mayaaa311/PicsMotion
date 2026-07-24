"""Tests for the Pydantic scene schema mirroring the TypeScript Zod schema."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from schemas.scene import SceneLayer, parse_scene_document


def make_layer(**overrides: Any) -> dict[str, Any]:
    layer: dict[str, Any] = {
        "id": "layer-1",
        "name": "Sky",
        "semanticLabel": "sky",
        "role": "background",
        "assetUrl": "/scene/layers/sky.webp",
        "bounds": {"x": 0, "y": 0, "width": 1, "height": 1},
        "anchor": {"x": 0.5, "y": 0.5},
        "depth": 1,
        "depthVariance": 0,
        "baseScale": 1,
        "baseRotation": 0,
        "baseOpacity": 1,
        "movement": {
            "enabled": True,
            "maxOffsetX": 0.02,
            "maxOffsetY": 0.02,
            "maxOffsetZ": 0,
            "maxRotation": 0,
            "parallaxStrength": 0.05,
            "dragEnabled": False,
            "returnMode": "spring",
        },
        "interactionTags": [],
        "materialTags": ["sky"],
        "audioSensitivity": {
            "bass": 0,
            "lowMid": 0,
            "highMid": 0,
            "treble": 0,
            "beat": 0,
            "loudness": 0.1,
        },
        "importance": 0.2,
        "locked": True,
        "revealBudget": {"maxOffsetX": 0, "maxOffsetY": 0, "confidence": 1},
        "provenance": {"visiblePixels": "original", "sourceImageHash": "abc123"},
    }
    layer.update(overrides)
    return layer


def make_scene(**overrides: Any) -> dict[str, Any]:
    scene: dict[str, Any] = {
        "version": "1.0",
        "id": "scene-1",
        "title": "Test Scene",
        "width": 1600,
        "height": 900,
        "aspectRatio": 1600 / 900,
        "originalImageUrl": "/scene/original/normalized.webp",
        "backgroundPlateUrl": "/scene/background.webp",
        "preset": "soft-nature",
        "visualAnalysis": {"sceneType": "landscape", "mainSubject": "tree"},
        "layers": [make_layer()],
        "atmosphere": {},
        "camera": {},
        "audioBindings": [],
        "metadata": {"createdAt": "2026-07-22T00:00:00Z", "pipelineVersion": "0.1.0"},
    }
    scene.update(overrides)
    return scene


def test_accepts_well_formed_scene_and_applies_defaults() -> None:
    scene = parse_scene_document(make_scene())
    assert scene.preset == "soft-nature"
    assert len(scene.layers) == 1
    assert scene.atmosphere.ambient_light == 1
    assert scene.camera.fov == 45
    assert scene.visual_analysis.secondary_subjects == []
    assert scene.atmosphere.fog.enabled is False


def test_round_trips_with_camel_case_json() -> None:
    scene = parse_scene_document(make_scene())
    dumped = scene.model_dump(by_alias=True)
    assert "aspectRatio" in dumped
    assert "originalImageUrl" in dumped
    assert dumped["layers"][0]["semanticLabel"] == "sky"
    # Re-parsing the dumped JSON succeeds.
    parse_scene_document(dumped)


def test_rejects_inconsistent_aspect_ratio() -> None:
    with pytest.raises(ValidationError) as exc:
        parse_scene_document(make_scene(aspectRatio=0.5))
    assert "aspectRatio" in str(exc.value)


def test_rejects_duplicate_layer_ids() -> None:
    with pytest.raises(ValidationError) as exc:
        parse_scene_document(make_scene(layers=[make_layer(), make_layer()]))
    assert "duplicate layer id" in str(exc.value)


def test_rejects_wrong_version() -> None:
    with pytest.raises(ValidationError):
        parse_scene_document(make_scene(version="0.9"))


def test_rejects_unknown_preset() -> None:
    with pytest.raises(ValidationError):
        parse_scene_document(make_scene(preset="vaporwave"))


def test_requires_at_least_one_layer() -> None:
    with pytest.raises(ValidationError):
        parse_scene_document(make_scene(layers=[]))


def test_rejects_out_of_range_depth() -> None:
    with pytest.raises(ValidationError):
        SceneLayer.model_validate(make_layer(depth=1.5))
