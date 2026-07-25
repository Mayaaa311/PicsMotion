"""Shared test fixtures. Ensures the service runs offline in mock mode."""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make the service package root importable when tests run from anywhere.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


#: Credential fields to force-empty so tests never see a real key or hit a paid
#: API — even when a developer has a live ``apps/ai-service/.env`` on disk.
_SECRET_FIELDS = (
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "FAL_KEY",
    "BFL_API_KEY",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "BFL_WEBHOOK_SECRET",
    "FAL_WEBHOOK_SECRET",
)


@pytest.fixture(autouse=True)
def _mock_mode_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Force mock mode with no provider keys.

    Setting the vars to "" (not deleting them) is deliberate: env vars take
    precedence over the ``.env`` file in pydantic-settings, so an empty env var
    overrides a real key that a developer keeps in ``apps/ai-service/.env`` —
    otherwise the live key would leak into the suite and tests could hit the paid
    OpenAI API.
    """
    for key in _SECRET_FIELDS:
        monkeypatch.setenv(key, "")
    monkeypatch.setenv("AI_PROVIDER_MODE", "mock")

    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
