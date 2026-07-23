"""Shared test fixtures. Ensures the service runs offline in mock mode."""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make the service package root importable when tests run from anywhere.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


@pytest.fixture(autouse=True)
def _mock_mode_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Force mock mode and clear any provider keys from the environment."""
    for key in list(os.environ):
        if key.endswith("_API_KEY") or key in {"FAL_KEY", "S3_ACCESS_KEY", "S3_SECRET_KEY"}:
            monkeypatch.delenv(key, raising=False)
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
