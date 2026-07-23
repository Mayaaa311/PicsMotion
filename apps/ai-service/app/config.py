"""Application configuration loaded from environment variables.

All settings are read via ``pydantic-settings`` so the service can start with no
API keys present (mock mode). Secret values are never logged or returned raw;
use :func:`mask_secret` when reporting configuration.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderMode = Literal["mock", "live"]

# Provider names used by the routing selectors, mapped to the setting that holds
# their credential. A provider is considered "configured" when its key is set.
PROVIDER_CREDENTIAL_FIELDS: dict[str, str] = {
    "anthropic": "anthropic_api_key",
    "openai": "openai_api_key",
    "fal": "fal_key",
    "bfl": "bfl_api_key",
}


def mask_secret(value: str | None) -> str | None:
    """Return a masked placeholder for a secret, never any raw characters.

    Returns ``None`` when the secret is absent so callers can distinguish
    "not configured" from "configured".
    """
    if not value:
        return None
    return "***"


class Settings(BaseSettings):
    """Typed view over the project ``.env`` / process environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Anthropic ----
    anthropic_api_key: str | None = None
    anthropic_scene_model: str = "claude-sonnet-5"

    # ---- OpenAI ----
    openai_api_key: str | None = None
    openai_scene_model: str = "gpt-5.6-terra"
    openai_image_model: str = "gpt-image-2"

    # ---- fal ----
    fal_key: str | None = None
    fal_layer_model: str = "fal-ai/qwen-image-layered"
    fal_text_segmentation_model: str = "fal-ai/evf-sam"
    fal_matting_model: str = "fal-ai/birefnet/v2"
    fal_depth_model: str = "fal-ai/image-preprocessors/depth-anything/v2"
    fal_style_model: str = "fal-ai/flux/dev/image-to-image"

    # ---- Black Forest Labs ----
    bfl_api_key: str | None = None
    bfl_erase_endpoint: str = "https://api.bfl.ai/v1/flux-tools/erase-v1"

    # ---- Provider routing ----
    scene_analysis_provider: str = "openai"
    primary_segmentation_provider: str = "fal"
    primary_depth_provider: str = "fal"
    primary_completion_provider: str = "bfl"
    fallback_completion_provider: str = "openai"

    # ---- Application ----
    database_url: str = "postgresql://postgres:postgres@localhost:5432/interactive_photo"
    redis_url: str = "redis://localhost:6379/0"
    public_web_base_url: str = "http://127.0.0.1:3000"
    public_api_base_url: str = "http://127.0.0.1:8000"

    # ---- Object storage ----
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_bucket: str = "interactive-photo"

    # ---- Webhooks ----
    bfl_webhook_secret: str | None = None
    fal_webhook_secret: str | None = None

    # ---- Development controls ----
    ai_provider_mode: ProviderMode = "mock"
    max_daily_ai_cost_usd: float = Field(default=5.0, ge=0)
    max_candidates_per_region: int = Field(default=1, ge=1)

    # Where processed scenes are written so the web app can serve them. Defaults
    # to the web app's public scenes dir for local dev (shared filesystem).
    scenes_output_dir: str = Field(
        default=str(
            os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "scenes")
            )
        )
    )

    @property
    def is_mock_mode(self) -> bool:
        return self.ai_provider_mode == "mock"

    def required_providers_for_mode(self) -> list[str]:
        """Return the provider names required for the active mode.

        Mock mode requires no external providers. Live mode requires every
        provider referenced by the routing selectors.
        """
        if self.is_mock_mode:
            return []
        selectors = [
            self.scene_analysis_provider,
            self.primary_segmentation_provider,
            self.primary_depth_provider,
            self.primary_completion_provider,
            self.fallback_completion_provider,
        ]
        seen: list[str] = []
        for name in selectors:
            if name and name not in seen:
                seen.append(name)
        return seen

    def is_provider_configured(self, provider: str) -> bool:
        """Whether the credential for ``provider`` is present."""
        field = PROVIDER_CREDENTIAL_FIELDS.get(provider)
        if field is None:
            return False
        return bool(getattr(self, field, None))

    def provider_status_report(self) -> dict[str, object]:
        """Build a readiness report with all secret values masked."""
        required = self.required_providers_for_mode()
        providers: dict[str, dict[str, object]] = {}
        for provider, field in PROVIDER_CREDENTIAL_FIELDS.items():
            value = getattr(self, field, None)
            providers[provider] = {
                "configured": bool(value),
                "keyMasked": mask_secret(value),
                "required": provider in required,
            }
        missing = [p for p in required if not self.is_provider_configured(p)]
        return {
            "mode": self.ai_provider_mode,
            "requiredProviders": required,
            "missingProviders": missing,
            "ready": self.is_mock_mode or not missing,
            "providers": providers,
        }


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""
    return Settings()
