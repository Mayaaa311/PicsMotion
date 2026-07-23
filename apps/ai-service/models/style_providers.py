"""Style-transfer provider adapters (mock, OpenAI, fal).

Every provider implements the same tiny :class:`StyleProvider` Protocol so
callers (``app/stylize.py``) never branch on which backend is active. Mock
mode is the default and makes no network calls; real providers are only
constructed when their credential is present, and raise a clear error
otherwise.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
from collections.abc import Callable
from typing import Any, Protocol, runtime_checkable

import httpx
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps

from app.config import Settings, get_settings
from models.styles import StyleSpec

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT_SECONDS = 120.0
_FAL_POLL_INTERVAL_SECONDS = 2.0
_FAL_MAX_POLL_ATTEMPTS = 60


@runtime_checkable
class StyleProvider(Protocol):
    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes: ...


# ---------------------------------------------------------------------------
# Shared image helpers
# ---------------------------------------------------------------------------


def _split_rgb_alpha(image: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Split an image into an RGB layer and its alpha mask.

    Images with no alpha channel are treated as fully opaque, so the
    round-trip through :func:`_merge_rgb_alpha` is always safe.
    """
    rgba = image.convert("RGBA")
    r, g, b, a = rgba.split()
    return Image.merge("RGB", (r, g, b)), a


def _merge_rgb_alpha(rgb: Image.Image, alpha: Image.Image) -> Image.Image:
    r, g, b = rgb.convert("RGB").split()
    return Image.merge("RGBA", (r, g, b, alpha.convert("L")))


def _to_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Mock provider: deterministic, offline, Pillow-only pixel transforms
# ---------------------------------------------------------------------------


def _stylize_spiderverse(rgb: Image.Image) -> Image.Image:
    """Halftone comic look: hard posterize, punchy saturation, ink edges."""
    posterized = ImageOps.posterize(rgb, 3)
    saturated = ImageEnhance.Color(posterized).enhance(2.2)
    edges = ImageOps.invert(rgb.convert("L").filter(ImageFilter.FIND_EDGES))
    inked_edges = edges.point(lambda p: 0 if p < 200 else 255).convert("RGB")
    return ImageChops.multiply(saturated, inked_edges)


def _stylize_watercolor(rgb: Image.Image) -> Image.Image:
    """Soft washes: blur, lower contrast/saturation, warm paper tint."""
    blurred = rgb.filter(ImageFilter.GaussianBlur(radius=2.5))
    softened = ImageEnhance.Contrast(blurred).enhance(0.75)
    desaturated = ImageEnhance.Color(softened).enhance(0.85)
    warm_overlay = Image.new("RGB", rgb.size, (255, 235, 205))
    return Image.blend(desaturated, warm_overlay, alpha=0.15)


def _stylize_ink_sketch(rgb: Image.Image) -> Image.Image:
    """Grayscale line art: autocontrast, inverted edge multiply, sharpen."""
    gray = ImageOps.autocontrast(rgb.convert("L"), cutoff=2)
    edges = ImageOps.invert(gray.filter(ImageFilter.FIND_EDGES))
    combined = ImageChops.multiply(gray, edges).filter(ImageFilter.SHARPEN)
    return ImageOps.autocontrast(combined).convert("RGB")


def _stylize_pop_art(rgb: Image.Image) -> Image.Image:
    """Warhol screenprint: aggressive posterize, max saturation, hue shift."""
    posterized = ImageOps.posterize(rgb, 2)
    saturated = ImageEnhance.Color(posterized).enhance(3.0)
    hue, sat, val = saturated.convert("HSV").split()
    shifted_hue = hue.point(lambda p: (p + 90) % 256)
    shifted = Image.merge("HSV", (shifted_hue, sat, val)).convert("RGB")
    return ImageEnhance.Contrast(shifted).enhance(1.3)


def _stylize_oil(rgb: Image.Image) -> Image.Image:
    """Impasto brushwork: mode-filter smoothing, richer color, sharpened strokes."""
    smoothed = rgb.filter(ImageFilter.ModeFilter(size=5))
    saturated = ImageEnhance.Color(smoothed).enhance(1.6)
    contrasted = ImageEnhance.Contrast(saturated).enhance(1.15)
    return contrasted.filter(ImageFilter.SHARPEN)


_MOCK_TRANSFORMS: dict[str, Callable[[Image.Image], Image.Image]] = {
    "spiderverse": _stylize_spiderverse,
    "watercolor": _stylize_watercolor,
    "ink-sketch": _stylize_ink_sketch,
    "pop-art": _stylize_pop_art,
    "oil": _stylize_oil,
}


class MockStyleProvider:
    """Deterministic, offline style transform using only local Pillow filters.

    Makes no network calls. Each style id maps to a distinct, seed-free
    pixel transform so different styles are visibly different from one
    another, while the subject and the original alpha channel (transparency
    / cutout shape) are always preserved exactly.
    """

    name = "mock"

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        image = Image.open(io.BytesIO(png_bytes))
        rgb, alpha = _split_rgb_alpha(image)
        transform = _MOCK_TRANSFORMS.get(style.id)
        if transform is None:
            raise ValueError(f"no mock transform registered for style: {style.id}")
        result_rgb = transform(rgb)
        result = _merge_rgb_alpha(result_rgb, alpha)
        return _to_png_bytes(result)


# ---------------------------------------------------------------------------
# OpenAI images/edits adapter
# ---------------------------------------------------------------------------


class OpenAIImageStyleProvider:
    """Restyles a layer via OpenAI's image-edit API.

    IMPORTANT: OpenAI's documentation for ``POST /v1/images/edits`` was
    behind an authentication wall at the time this was written and could not
    be fetched live. This targets the multipart "image edit" request/response
    shape (``model``, ``image``, ``prompt``, ``size``, ``n`` ->
    ``{"data": [{"b64_json": ...}]}``) that has been stable across recent
    OpenAI image API versions, but it MUST be re-verified against the live
    docs before this is relied on in production. The model id is
    configurable via ``OPENAI_IMAGE_MODEL`` / ``Settings.openai_image_model``.
    """

    name = "openai"

    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is required to use OpenAIImageStyleProvider. "
                "Set AI_PROVIDER_MODE=mock to use the offline mock provider instead."
            )
        self._api_key = settings.openai_api_key
        self._model = settings.openai_image_model

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        original_alpha = image.split()[3]

        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                "https://api.openai.com/v1/images/edits",
                headers={"Authorization": f"Bearer {self._api_key}"},
                data={"model": self._model, "prompt": style.prompt, "size": "auto", "n": "1"},
                files={"image": ("layer.png", png_bytes, "image/png")},
            )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        b64_json: str = payload["data"][0]["b64_json"]
        result_bytes = base64.b64decode(b64_json)

        # Re-apply the original alpha so the layer's transparency / cutout
        # shape survives the round trip through an RGB-only image API.
        result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        if result.size != image.size:
            result = result.resize(image.size, Image.Resampling.LANCZOS)
        result.putalpha(original_alpha)
        return _to_png_bytes(result)


# ---------------------------------------------------------------------------
# fal image-to-image adapter
# ---------------------------------------------------------------------------


class FalImg2ImgStyleProvider:
    """Restyles a layer via a fal.ai image-to-image queue model.

    IMPORTANT: fal's queue REST schema is versioned per model family and was
    not directly verifiable at build time without a live key. This
    implements the generically documented "submit -> poll status -> fetch
    result" queue pattern (``https://queue.fal.run/<model>``) against
    ``FAL_STYLE_MODEL``. VERIFY the request/response field names for the
    configured model against the live fal docs before depending on this in
    production. This adapter always makes real network calls and is never
    exercised in the test suite.
    """

    name = "fal"

    def __init__(self, settings: Settings) -> None:
        if not settings.fal_key:
            raise RuntimeError(
                "FAL_KEY is required to use FalImg2ImgStyleProvider. "
                "Set AI_PROVIDER_MODE=mock to use the offline mock provider instead."
            )
        self._api_key = settings.fal_key
        self._model = settings.fal_style_model

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        original_alpha = image.split()[3]
        data_uri = "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")
        headers = {"Authorization": f"Key {self._api_key}"}
        submit_url = f"https://queue.fal.run/{self._model}"

        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            submitted = await client.post(
                submit_url,
                headers=headers,
                json={"image_url": data_uri, "prompt": style.prompt, "strength": 0.65},
            )
            submitted.raise_for_status()
            submission: dict[str, Any] = submitted.json()
            request_id = submission["request_id"]
            status_url = submission.get(
                "status_url", f"{submit_url}/requests/{request_id}/status"
            )
            response_url = submission.get("response_url", f"{submit_url}/requests/{request_id}")

            result_payload = await self._poll_until_complete(
                client, status_url=status_url, response_url=response_url, headers=headers
            )
            if result_payload is None:
                raise TimeoutError(f"fal request {request_id} did not complete in time")

            images = result_payload.get("images")
            if not isinstance(images, list) or not images:
                raise RuntimeError(
                    f"fal response for request {request_id} had no images: {result_payload}"
                )
            image_url = images[0]["url"]
            image_response = await client.get(image_url)
            image_response.raise_for_status()
            result_bytes = image_response.content

        result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        if result.size != image.size:
            result = result.resize(image.size, Image.Resampling.LANCZOS)
        result.putalpha(original_alpha)
        return _to_png_bytes(result)

    async def _poll_until_complete(
        self,
        client: httpx.AsyncClient,
        *,
        status_url: str,
        response_url: str,
        headers: dict[str, str],
    ) -> dict[str, Any] | None:
        for _attempt in range(_FAL_MAX_POLL_ATTEMPTS):
            status_response = await client.get(status_url, headers=headers)
            status_response.raise_for_status()
            if status_response.json().get("status") == "COMPLETED":
                result_response = await client.get(response_url, headers=headers)
                result_response.raise_for_status()
                payload: dict[str, Any] = result_response.json()
                return payload
            await asyncio.sleep(_FAL_POLL_INTERVAL_SECONDS)
        return None


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def get_style_provider(settings: Settings | None = None) -> StyleProvider:
    """Select a style provider based on ``AI_PROVIDER_MODE`` and credentials.

    Mock mode always wins. In live mode, OpenAI is preferred when
    ``OPENAI_API_KEY`` is set, then fal when ``FAL_KEY`` is set; if neither
    credential is present this falls back to the mock provider and logs a
    warning rather than failing the caller outright.
    """
    resolved = settings if settings is not None else get_settings()
    if resolved.is_mock_mode:
        return MockStyleProvider()
    if resolved.openai_api_key:
        return OpenAIImageStyleProvider(resolved)
    if resolved.fal_key:
        return FalImg2ImgStyleProvider(resolved)
    logger.warning(
        "AI_PROVIDER_MODE=%s but neither OPENAI_API_KEY nor FAL_KEY is set; "
        "falling back to MockStyleProvider.",
        resolved.ai_provider_mode,
    )
    return MockStyleProvider()
