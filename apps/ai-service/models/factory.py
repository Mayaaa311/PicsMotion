"""Provider factory: selects mock or real providers based on the active mode.

Only mock providers are implemented in Milestone 0. Requesting a real provider
raises :class:`NotImplementedError` with a clear message.
"""

from __future__ import annotations

from app.config import Settings, get_settings
from models.providers import (
    DepthProvider,
    ImageCompletionProvider,
    SceneAnalysisProvider,
    SegmentationProvider,
)
from pipelines.depth.mock import MockDepthProvider
from pipelines.inpainting.mock import MockCompletionProvider
from pipelines.scene_analysis.mock import MockSceneAnalysisProvider
from pipelines.segmentation.mock import MockSegmentationProvider

_NOT_IMPLEMENTED = (
    "Real provider '{name}' is not implemented in Milestone 0. "
    "Set AI_PROVIDER_MODE=mock to use the deterministic mock providers."
)


def _resolve_settings(settings: Settings | None) -> Settings:
    return settings if settings is not None else get_settings()


def get_scene_analysis_provider(settings: Settings | None = None) -> SceneAnalysisProvider:
    resolved = _resolve_settings(settings)
    if resolved.is_mock_mode:
        return MockSceneAnalysisProvider()
    raise NotImplementedError(_NOT_IMPLEMENTED.format(name=resolved.scene_analysis_provider))


def get_segmentation_provider(settings: Settings | None = None) -> SegmentationProvider:
    resolved = _resolve_settings(settings)
    if resolved.is_mock_mode:
        return MockSegmentationProvider()
    raise NotImplementedError(_NOT_IMPLEMENTED.format(name=resolved.primary_segmentation_provider))


def get_depth_provider(settings: Settings | None = None) -> DepthProvider:
    resolved = _resolve_settings(settings)
    if resolved.is_mock_mode:
        return MockDepthProvider()
    raise NotImplementedError(_NOT_IMPLEMENTED.format(name=resolved.primary_depth_provider))


def get_completion_provider(settings: Settings | None = None) -> ImageCompletionProvider:
    resolved = _resolve_settings(settings)
    if resolved.is_mock_mode:
        return MockCompletionProvider()
    raise NotImplementedError(_NOT_IMPLEMENTED.format(name=resolved.primary_completion_provider))
