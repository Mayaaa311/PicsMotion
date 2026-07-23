"""Deterministic mock scene analysis provider (no network)."""

from __future__ import annotations

from schemas.scene import VisualAnalysis


class MockSceneAnalysisProvider:
    """Returns canned :class:`VisualAnalysis` data for offline development."""

    name = "mock"

    async def analyze_scene(self, image_url: str) -> VisualAnalysis:
        return VisualAnalysis(
            scene_type="landscape",
            main_subject="tree",
            secondary_subjects=["rocks"],
            foreground_candidates=["grass"],
            midground_candidates=["tree"],
            background="sky",
            vegetation_regions=["grass", "tree"],
            sky_regions=["sky"],
            lighting_direction="top-left",
            depth_of_field="deep",
            camera_style="wide",
            dominant_colors=["#6a8caf", "#3b5323", "#c2b280"],
            mood="calm",
            suggested_preset="soft-nature",
            suggested_motion_tags=["sway", "parallax"],
            suggested_segmentation_prompts=["tree", "grass", "sky"],
            expected_segmentation_difficulty="low",
        )
