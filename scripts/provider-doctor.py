#!/usr/bin/env python3
"""provider-doctor.py — report AI provider readiness without printing secrets.

- Reports which provider variables are present (values masked).
- Optionally validates lightweight authentication where a low-cost endpoint exists
  (``--check-auth``); by default it does NO network calls and NEVER generates.
- Returns a nonzero exit code only when a provider REQUIRED by the selected
  ``AI_PROVIDER_MODE`` is unavailable.

Usage:
    python scripts/provider-doctor.py             # offline presence report
    python scripts/provider-doctor.py --check-auth # + lightweight auth probes
"""
from __future__ import annotations

import argparse
import os
from dataclasses import dataclass, field

# Load a local .env if python-dotenv is available; otherwise rely on the
# ambient environment. We never fail just because dotenv is missing.
try:  # pragma: no cover - convenience only
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # noqa: BLE001
    pass


def mask(value: str | None) -> str:
    """Return a masked preview of a secret, never the full value."""
    if not value:
        return "(unset)"
    v = value.strip()
    if len(v) <= 8:
        return "****"
    return f"{v[:4]}...{v[-4:]}"


@dataclass
class Provider:
    name: str
    key_var: str
    #: modes for which this provider is REQUIRED
    required_for: set[str] = field(default_factory=set)

    @property
    def present(self) -> bool:
        return bool(os.environ.get(self.key_var, "").strip())


PROVIDERS = [
    Provider("OpenAI", "OPENAI_API_KEY", required_for=set()),
    Provider("Anthropic", "ANTHROPIC_API_KEY", required_for=set()),
    Provider("fal", "FAL_KEY", required_for=set()),
    Provider("Black Forest Labs", "BFL_API_KEY", required_for=set()),
]


def selected_mode() -> str:
    return os.environ.get("AI_PROVIDER_MODE", "mock").strip().lower()


def required_providers(mode: str) -> list[str]:
    """Which provider keys must be present for the given mode to function.

    In ``mock`` mode nothing is required. In ``live`` mode we require at least
    one scene-analysis provider plus fal (segmentation/matting/depth) plus one
    completion provider, following the routing defaults in the spec.
    """
    if mode == "mock":
        return []
    required = ["FAL_KEY"]  # segmentation, matting, depth
    scene = os.environ.get("SCENE_ANALYSIS_PROVIDER", "openai").strip().lower()
    required.append("ANTHROPIC_API_KEY" if scene == "anthropic" else "OPENAI_API_KEY")
    completion = os.environ.get("PRIMARY_COMPLETION_PROVIDER", "bfl").strip().lower()
    required.append("BFL_API_KEY" if completion == "bfl" else "OPENAI_API_KEY")
    # de-duplicate, preserve order
    seen: set[str] = set()
    return [x for x in required if not (x in seen or seen.add(x))]


def check_auth(provider: Provider) -> str:
    """Lightweight, low-cost auth probe. Returns a status string.

    We deliberately keep this cheap and never trigger generation. If httpx is
    unavailable we skip network checks gracefully.
    """
    if not provider.present:
        return "skip (no key)"
    try:
        import httpx  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return "skip (httpx not installed)"

    key = os.environ[provider.key_var].strip()
    try:
        if provider.name == "OpenAI":
            r = httpx.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=10.0,
            )
        elif provider.name == "Anthropic":
            # /v1/models is a cheap authenticated GET on the Anthropic API.
            r = httpx.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                timeout=10.0,
            )
        elif provider.name == "fal":
            # No free unauthenticated listing endpoint; report presence only.
            return "present (auth probe not implemented)"
        elif provider.name == "Black Forest Labs":
            return "present (auth probe not implemented)"
        else:  # pragma: no cover
            return "unknown"
    except Exception as exc:  # noqa: BLE001
        return f"error ({type(exc).__name__})"

    if r.status_code in (200, 201):
        return "ok"
    if r.status_code in (401, 403):
        return f"unauthorized ({r.status_code}) — rotate/verify key"
    return f"unexpected status {r.status_code}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Report AI provider readiness (no secrets printed).")
    parser.add_argument("--check-auth", action="store_true", help="run lightweight auth probes")
    args = parser.parse_args()

    mode = selected_mode()
    required = required_providers(mode)

    print(f"AI_PROVIDER_MODE = {mode}")
    print(f"Required providers for this mode: {', '.join(required) or '(none — mock mode)'}")
    print("-" * 60)

    missing_required: list[str] = []
    for p in PROVIDERS:
        status = "present" if p.present else "absent"
        req = " [REQUIRED]" if p.key_var in required else ""
        line = f"{p.name:<20} {p.key_var:<20} {status:<8} {mask(os.environ.get(p.key_var))}{req}"
        if args.check_auth:
            line += f"   auth: {check_auth(p)}"
        print(line)
        if p.key_var in required and not p.present:
            missing_required.append(p.key_var)

    print("-" * 60)
    if missing_required:
        print(f"FAIL: missing required provider(s) for mode '{mode}': {', '.join(missing_required)}")
        return 1

    print(f"OK: all providers required for mode '{mode}' are present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
