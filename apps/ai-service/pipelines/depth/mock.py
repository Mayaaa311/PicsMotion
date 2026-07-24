"""Deterministic mock depth provider (no network)."""

from __future__ import annotations

from models.providers import DepthResult


class MockDepthProvider:
    """Returns a canned :class:`DepthResult` for offline development."""

    name = "mock"

    async def estimate_depth(self, image_url: str) -> DepthResult:
        return DepthResult(
            provider=self.name,
            depth_map_url="mock://depth/depth-map.png",
            min_depth=0.0,
            max_depth=1.0,
        )
