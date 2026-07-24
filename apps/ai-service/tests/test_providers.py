"""Tests for the /providers report and secret masking."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.config import Settings


def test_providers_report_mock_mode(client: TestClient) -> None:
    response = client.get("/providers")
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "mock"
    # Mock mode requires no external providers and is always ready.
    assert body["requiredProviders"] == []
    assert body["missingProviders"] == []
    assert body["ready"] is True
    assert "providers" in body


def test_providers_never_leak_raw_secrets(client: TestClient) -> None:
    response = client.get("/providers")
    payload = json.dumps(response.json())
    # No credential fields should appear in the response with no keys set.
    for token in ("keyMasked", "configured"):
        assert token in payload  # structure present
    # With no env keys, all masked values are null.
    for provider in response.json()["providers"].values():
        assert provider["configured"] is False
        assert provider["keyMasked"] is None


def test_mask_secret_hides_raw_value() -> None:
    secret = "sk-super-secret-value-1234567890"
    settings = Settings(ai_provider_mode="mock", anthropic_api_key=secret)
    report = settings.provider_status_report()
    serialized = json.dumps(report)
    assert secret not in serialized
    providers = report["providers"]
    assert isinstance(providers, dict)
    anthropic = providers["anthropic"]
    assert anthropic["configured"] is True
    assert anthropic["keyMasked"] == "***"


def test_required_providers_for_live_mode() -> None:
    settings = Settings(ai_provider_mode="live")
    required = settings.required_providers_for_mode()
    # Defaults route to openai/fal/bfl.
    assert "openai" in required
    assert "fal" in required
    assert "bfl" in required
