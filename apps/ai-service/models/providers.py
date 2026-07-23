"""Provider Protocol interfaces and their result types.

These async interfaces define the contract every AI provider (mock or real)
must satisfy. The method signatures mirror section 17.15 of the project spec.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field

from schemas.scene import VisualAnalysis

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


class ProposedLayer(BaseModel):
    """A single layer proposal (pre-segmentation)."""

    semantic_label: str
    role: str
    prompt: str


class LayerProposalResult(BaseModel):
    provider: str
    layers: list[ProposedLayer] = Field(default_factory=list)


class SegmentationResult(BaseModel):
    provider: str
    mask_url: str
    score: float = Field(ge=0, le=1)
    label: str


class MattingResult(BaseModel):
    provider: str
    alpha_url: str
    model_variant: str


class DepthResult(BaseModel):
    provider: str
    depth_map_url: str
    min_depth: float = Field(ge=0, le=1)
    max_depth: float = Field(ge=0, le=1)


class CompletionCandidate(BaseModel):
    provider: str
    image_url: str
    seed: int
    score: float = Field(ge=0, le=1)


# ---------------------------------------------------------------------------
# Protocol interfaces
# ---------------------------------------------------------------------------


@runtime_checkable
class SceneAnalysisProvider(Protocol):
    async def analyze_scene(self, image_url: str) -> VisualAnalysis: ...


@runtime_checkable
class LayerProposalProvider(Protocol):
    async def propose_layers(
        self,
        image_url: str,
        *,
        number_of_layers: int,
        prompt: str | None = None,
    ) -> LayerProposalResult: ...


@runtime_checkable
class SegmentationProvider(Protocol):
    async def segment_text(
        self,
        image_url: str,
        prompt: str,
        *,
        negative_prompt: str | None = None,
    ) -> SegmentationResult: ...


@runtime_checkable
class MattingProvider(Protocol):
    async def refine_alpha(
        self,
        image_url: str,
        *,
        model_variant: str,
    ) -> MattingResult: ...


@runtime_checkable
class DepthProvider(Protocol):
    async def estimate_depth(self, image_url: str) -> DepthResult: ...


@runtime_checkable
class ImageCompletionProvider(Protocol):
    async def erase_masked_region(
        self,
        image_url: str,
        mask_url: str,
        *,
        dilation_pixels: int,
        seed: int | None = None,
    ) -> list[CompletionCandidate]: ...

    async def fill_masked_region(
        self,
        image_url: str,
        mask_url: str,
        prompt: str,
    ) -> list[CompletionCandidate]: ...
