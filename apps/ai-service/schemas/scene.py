"""Pydantic v2 mirror of the TypeScript Zod scene schema.

Field names round-trip with the TypeScript side: models use a camelCase alias
generator and accept both snake_case (Python) and camelCase (JSON) input. Dump
with ``model_dump(by_alias=True)`` to produce TS-compatible JSON.

Mirrors ``packages/scene-schema/src/scene.ts`` and ``audio.ts``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)
from pydantic.alias_generators import to_camel

SCENE_SCHEMA_VERSION = "1.0"
ASPECT_RATIO_TOLERANCE = 0.02

PresetName = Literal["soft-nature", "urban", "dark", "nostalgic"]
LayerRole = Literal[
    "background",
    "distant",
    "midground",
    "secondary-subject",
    "primary-subject",
    "foreground",
    "atmosphere",
]
ReturnMode = Literal["spring", "inertia", "physics", "fixed"]
VisiblePixels = Literal["original", "generated", "mixed"]
SegmentationDifficulty = Literal["low", "medium", "high"]
AudioBindingSource = Literal["bass", "lowMid", "highMid", "treble", "loudness", "beatPulse"]
AudioCurve = Literal["linear", "easeIn", "easeOut", "exponential"]


class SceneModel(BaseModel):
    """Base model: camelCase JSON aliases, accepts snake_case or camelCase input."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class Bounds(SceneModel):
    """Normalized [0,1] rectangle in image space (origin top-left)."""

    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class Anchor(SceneModel):
    x: float
    y: float


class LayerMovement(SceneModel):
    enabled: bool
    max_offset_x: float = Field(ge=0)
    max_offset_y: float = Field(ge=0)
    max_offset_z: float = Field(ge=0)
    max_rotation: float = Field(ge=0)
    parallax_strength: float = Field(ge=0)
    drag_enabled: bool
    return_mode: ReturnMode


class AudioSensitivity(SceneModel):
    bass: float = Field(ge=0, le=1)
    low_mid: float = Field(ge=0, le=1)
    high_mid: float = Field(ge=0, le=1)
    treble: float = Field(ge=0, le=1)
    beat: float = Field(ge=0, le=1)
    loudness: float = Field(ge=0, le=1)


class RevealBudget(SceneModel):
    """Limits on how far a layer may move, so unreconstructed pixels stay hidden."""

    max_offset_x: float = Field(ge=0)
    max_offset_y: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    generated_coverage_mask_url: str | None = None


class Provenance(SceneModel):
    visible_pixels: VisiblePixels
    source_image_hash: str
    segmentation_provider: str | None = None
    matting_provider: str | None = None
    completion_provider: str | None = None
    provider_request_ids: list[str] | None = None


class SceneLayer(SceneModel):
    id: str = Field(min_length=1)
    name: str
    semantic_label: str
    role: LayerRole

    asset_url: str = Field(min_length=1)
    mask_url: str | None = None
    alpha_asset_url: str | None = None

    bounds: Bounds
    anchor: Anchor

    # Relative depth in [0,1]; 0 = nearest camera, 1 = farthest.
    depth: float = Field(ge=0, le=1)
    depth_variance: float = Field(ge=0)
    base_scale: float = Field(gt=0)
    base_rotation: float
    base_opacity: float = Field(ge=0, le=1)

    movement: LayerMovement

    interaction_tags: list[str]
    material_tags: list[str]
    audio_sensitivity: AudioSensitivity

    importance: float = Field(ge=0, le=1)
    locked: bool

    reveal_budget: RevealBudget
    provenance: Provenance


class VisualAnalysis(SceneModel):
    scene_type: str
    main_subject: str
    secondary_subjects: list[str] = Field(default_factory=list)
    foreground_candidates: list[str] = Field(default_factory=list)
    midground_candidates: list[str] = Field(default_factory=list)
    background: str = ""
    water_regions: list[str] = Field(default_factory=list)
    vegetation_regions: list[str] = Field(default_factory=list)
    sky_regions: list[str] = Field(default_factory=list)
    transparent_or_reflective_regions: list[str] = Field(default_factory=list)
    lighting_direction: str = ""
    depth_of_field: str = ""
    camera_style: str = ""
    dominant_colors: list[str] = Field(default_factory=list)
    mood: str = ""
    suggested_preset: PresetName | None = None
    suggested_motion_tags: list[str] = Field(default_factory=list)
    suggested_segmentation_prompts: list[str] = Field(default_factory=list)
    locked_objects: list[str] = Field(default_factory=list)
    expected_segmentation_difficulty: SegmentationDifficulty = "medium"
    inpainting_risk_areas: list[str] = Field(default_factory=list)


class FogConfig(SceneModel):
    enabled: bool = False
    density: float = Field(default=0, ge=0, le=1)
    color: str = "#ffffff"
    layers: int = Field(default=0, ge=0, le=5)


class AtmosphereConfig(SceneModel):
    fog: FogConfig = Field(default_factory=FogConfig)
    ambient_light: float = Field(default=1, ge=0, le=2)
    vignette: float = Field(default=0, ge=0, le=1)
    grain: float = Field(default=0, ge=0, le=1)


class CameraConfig(SceneModel):
    # Field of view in degrees for the perspective camera.
    fov: float = Field(default=45, ge=1, le=179)
    parallax_strength: float = Field(default=0.16, ge=0)
    zoom_response: float = Field(default=0.03, ge=0)
    shake_strength: float = Field(default=0, ge=0)
    drift_strength: float = Field(default=0, ge=0)


class AudioBinding(SceneModel):
    source: AudioBindingSource
    target: str = Field(min_length=1)
    scale: float
    offset: float
    smoothing: float = Field(ge=0, le=1)
    clamp: tuple[float, float]
    curve: AudioCurve = "linear"


class SceneMetadata(SceneModel):
    created_at: str
    pipeline_version: str


class SceneDocument(SceneModel):
    version: Literal["1.0"]
    id: str = Field(min_length=1)
    title: str
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    aspect_ratio: float = Field(gt=0)
    original_image_url: str = Field(min_length=1)
    background_plate_url: str = Field(min_length=1)
    depth_map_url: str | None = None
    preset: PresetName
    visual_analysis: VisualAnalysis
    layers: list[SceneLayer] = Field(min_length=1)
    atmosphere: AtmosphereConfig
    camera: CameraConfig
    audio_bindings: list[AudioBinding] = Field(default_factory=list)
    metadata: SceneMetadata

    @model_validator(mode="after")
    def _check_refinements(self) -> SceneDocument:
        # Aspect ratio must be internally consistent (within rounding tolerance).
        expected = self.width / self.height
        if abs(expected - self.aspect_ratio) > ASPECT_RATIO_TOLERANCE:
            raise ValueError(
                f"aspectRatio {self.aspect_ratio} does not match "
                f"width/height ({expected:.3f})"
            )
        # Layer ids must be unique.
        seen: set[str] = set()
        for layer in self.layers:
            if layer.id in seen:
                raise ValueError(f"duplicate layer id: {layer.id}")
            seen.add(layer.id)
        return self


def parse_scene_document(data: dict) -> SceneDocument:
    """Parse and validate a dict as a :class:`SceneDocument`.

    Raises ``pydantic.ValidationError`` on failure.
    """
    return SceneDocument.model_validate(data)
