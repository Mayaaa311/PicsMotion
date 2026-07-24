"""Deterministic mock segmentation provider (no network)."""

from __future__ import annotations

from models.providers import SegmentationResult


class MockSegmentationProvider:
    """Returns a canned :class:`SegmentationResult` for offline development."""

    name = "mock"

    async def segment_text(
        self,
        image_url: str,
        prompt: str,
        *,
        negative_prompt: str | None = None,
    ) -> SegmentationResult:
        return SegmentationResult(
            provider=self.name,
            mask_url=f"mock://masks/{prompt.replace(' ', '-')}.png",
            score=0.92,
            label=prompt,
        )
