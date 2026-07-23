"""Deterministic mock image completion provider (no network)."""

from __future__ import annotations

from models.providers import CompletionCandidate


class MockCompletionProvider:
    """Returns canned completion candidates for offline development."""

    name = "mock"

    async def erase_masked_region(
        self,
        image_url: str,
        mask_url: str,
        *,
        dilation_pixels: int,
        seed: int | None = None,
    ) -> list[CompletionCandidate]:
        resolved_seed = 42 if seed is None else seed
        return [
            CompletionCandidate(
                provider=self.name,
                image_url="mock://completion/erased.png",
                seed=resolved_seed,
                score=0.9,
            )
        ]

    async def fill_masked_region(
        self,
        image_url: str,
        mask_url: str,
        prompt: str,
    ) -> list[CompletionCandidate]:
        return [
            CompletionCandidate(
                provider=self.name,
                image_url=f"mock://completion/filled-{prompt.replace(' ', '-')}.png",
                seed=42,
                score=0.88,
            )
        ]
