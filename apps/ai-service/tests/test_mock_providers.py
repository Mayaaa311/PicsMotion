"""Tests for the mock providers and the provider factory."""

from __future__ import annotations

import pytest

from app.config import Settings
from models.factory import (
    get_completion_provider,
    get_depth_provider,
    get_scene_analysis_provider,
    get_segmentation_provider,
)


async def test_mock_scene_analysis_is_deterministic() -> None:
    settings = Settings(ai_provider_mode="mock")
    provider = get_scene_analysis_provider(settings)
    first = await provider.analyze_scene("mock://input.jpg")
    second = await provider.analyze_scene("mock://input.jpg")
    assert first.model_dump() == second.model_dump()
    assert first.main_subject == "tree"


async def test_mock_segmentation_returns_result() -> None:
    provider = get_segmentation_provider(Settings(ai_provider_mode="mock"))
    result = await provider.segment_text("mock://input.jpg", "tree")
    assert result.provider == "mock"
    assert result.label == "tree"
    assert 0.0 <= result.score <= 1.0


async def test_mock_depth_returns_result() -> None:
    provider = get_depth_provider(Settings(ai_provider_mode="mock"))
    result = await provider.estimate_depth("mock://input.jpg")
    assert result.provider == "mock"
    assert result.min_depth == 0.0
    assert result.max_depth == 1.0


async def test_mock_completion_returns_candidates() -> None:
    provider = get_completion_provider(Settings(ai_provider_mode="mock"))
    erased = await provider.erase_masked_region(
        "mock://input.jpg", "mock://mask.png", dilation_pixels=8
    )
    assert len(erased) >= 1
    assert erased[0].provider == "mock"
    filled = await provider.fill_masked_region("mock://input.jpg", "mock://mask.png", "grass")
    assert len(filled) >= 1


def test_live_mode_raises_not_implemented() -> None:
    settings = Settings(ai_provider_mode="live")
    with pytest.raises(NotImplementedError):
        get_scene_analysis_provider(settings)
    with pytest.raises(NotImplementedError):
        get_segmentation_provider(settings)
    with pytest.raises(NotImplementedError):
        get_depth_provider(settings)
    with pytest.raises(NotImplementedError):
        get_completion_provider(settings)
