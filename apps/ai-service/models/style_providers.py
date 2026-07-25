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
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

import httpx
import numpy as np
from PIL import Image

from app.config import Settings, get_settings
from models.styles import StyleSpec

if TYPE_CHECKING:
    import onnxruntime as ort

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT_SECONDS = 120.0
_FAL_POLL_INTERVAL_SECONDS = 2.0
_FAL_MAX_POLL_ATTEMPTS = 60

# gpt-image-1's safety filter is probabilistic: the same prompt+image can return
# 400 on one call and 200 on the next. Retry those (and 429/5xx) with a linear
# backoff so a single flaky rejection doesn't fail an otherwise-good style.
_OPENAI_MAX_ATTEMPTS = 4
_OPENAI_RETRY_BACKOFF_SECONDS = 3.0
_OPENAI_RETRIABLE_STATUS = frozenset({400, 408, 409, 429})

# Brushwork emphasis for colour-preserving styles (Van Gogh). Tuned to make the
# strokes read boldly while keeping the photo's own colours; adjust to taste.
_BRUSH_CONTRAST = 1.18
_BRUSH_SHARPEN = 0.6
_BRUSH_SHARPEN_SIGMA = 0.0018  # as a fraction of the long edge


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


def keep_original_colour(styled_png: bytes, original_png: bytes) -> bytes:
    """Keep the style's brushwork but the photograph's own colours.

    Style transfer carries over texture *and* palette, so a net trained on Starry
    Night paints every photo blue and yellow. When a style is wanted only for how
    it paints, recombine the **stylised luminance** -- which is where the brush
    strokes live -- with the **original's chroma** (Gatys et al., "Preserving Color
    in Neural Artistic Style Transfer").

    The stylised luminance is also rescaled to the photo's mean/standard deviation,
    otherwise the style's own global brightness bias survives and the result is
    over- or under-exposed relative to the source.
    """
    import cv2

    styled = Image.open(io.BytesIO(styled_png)).convert("RGB")
    original = Image.open(io.BytesIO(original_png)).convert("RGBA")
    original_alpha = original.split()[3]
    original_rgb = original.convert("RGB")
    if styled.size != original_rgb.size:
        styled = styled.resize(original_rgb.size, Image.Resampling.LANCZOS)

    styled_ycc = cv2.cvtColor(np.asarray(styled), cv2.COLOR_RGB2YCrCb).astype(np.float32)
    original_ycc = cv2.cvtColor(np.asarray(original_rgb), cv2.COLOR_RGB2YCrCb).astype(np.float32)

    styled_luma = styled_ycc[..., 0]
    original_luma = original_ycc[..., 0]
    mean_o = float(original_luma.mean())
    matched = (styled_luma - styled_luma.mean()) * (
        float(original_luma.std()) / (float(styled_luma.std()) + 1e-6)
    ) + mean_o

    # Make the brushwork read boldly. The strokes live entirely in this luma
    # channel (chroma stays the photo's), so pop them WITHOUT touching colour:
    #   * expand contrast around the mid so light/dark strokes separate, then
    #   * unsharp-mask to accentuate the impasto ridges the net painted.
    matched = mean_o + (matched - mean_o) * _BRUSH_CONTRAST
    sigma = max(1.0, max(styled.size) * _BRUSH_SHARPEN_SIGMA)
    blurred = cv2.GaussianBlur(matched, (0, 0), sigma)
    matched = matched + _BRUSH_SHARPEN * (matched - blurred)

    merged = original_ycc.copy()  # keeps Cr/Cb — the photo's colour
    merged[..., 0] = np.clip(matched, 0, 255)
    rgb = cv2.cvtColor(merged.astype(np.uint8), cv2.COLOR_YCrCb2RGB)
    return _to_png_bytes(_merge_rgb_alpha(Image.fromarray(rgb, "RGB"), original_alpha))


# ---------------------------------------------------------------------------
# Algorithmic filter provider (OpenCV NPR, Delaunay, quantisation, grading)
# ---------------------------------------------------------------------------


class FilterStyleProvider:
    """Applies a published image-processing technique from ``STYLE_FILTERS``.

    Fully offline and dependency-light (OpenCV + numpy), and always available —
    there are no weights to download. Covers the graphic styles (sketch, comic,
    pixel art, low poly, neon grades) that neural style transfer does poorly.
    """

    name = "filter"

    def _run(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        from models.style_filters import STYLE_FILTERS

        transform = STYLE_FILTERS.get(style.model)
        if transform is None:
            known = ", ".join(sorted(STYLE_FILTERS))
            raise ValueError(f"no filter '{style.model}' for style {style.id}; known: {known}")

        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        alpha = image.split()[3]
        result_rgb = transform(np.asarray(image.convert("RGB")))
        result = Image.fromarray(np.clip(result_rgb, 0, 255).astype(np.uint8), "RGB")
        if result.size != image.size:
            result = result.resize(image.size, Image.Resampling.LANCZOS)
        return _to_png_bytes(_merge_rgb_alpha(result, alpha))

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        # CPU-bound OpenCV work: keep it off the event loop.
        return await asyncio.to_thread(self._run, png_bytes, style)


# ---------------------------------------------------------------------------
# Local ONNX neural style transfer (fast-neural-style, offline, no API keys)
# ---------------------------------------------------------------------------


class OnnxStyleProvider:
    """Restyles an image with a fast-neural-style ONNX model, on CPU, offline.

    Uses the pretrained fast-neural-style models from the ONNX Model Zoo
    (Johnson et al. architecture). The models are fully convolutional, so
    :func:`~scripts.prep_style_models` rewrites their input/output H/W dims to
    be dynamic and this provider runs them at up to ``settings.style_max_size``
    on the longest side -- sharp, bold output with no network calls.

    The original alpha channel is re-applied so a layer's cutout shape survives
    the RGB-only network (a fully-opaque photo simply round-trips unchanged).
    """

    name = "onnx"

    def __init__(self, settings: Settings) -> None:
        self._models_dir = Path(settings.style_models_dir)
        self._max_size = settings.style_max_size
        self._intra_op_threads = settings.style_intra_op_threads
        self._sessions: dict[str, ort.InferenceSession] = {}

    def model_path(self, style: StyleSpec) -> Path:
        return self._models_dir / f"{style.model}.onnx"

    def is_available(self, style: StyleSpec) -> bool:
        return self.model_path(style).is_file()

    def _session(self, style: StyleSpec) -> ort.InferenceSession:
        cached = self._sessions.get(style.model)
        if cached is not None:
            return cached
        import onnxruntime as ort  # local import: heavy, optional dependency

        path = self.model_path(style)
        if not path.is_file():
            raise FileNotFoundError(
                f"ONNX style model not found: {path}. Run scripts/prep-style-models.py."
            )
        # Bound the per-session thread pool and disable the arena allocator: the
        # arena grows to the peak activation size and never returns it, so five
        # cached sessions retain gigabytes long after their last run.
        options = ort.SessionOptions()
        options.intra_op_num_threads = self._intra_op_threads
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        session = ort.InferenceSession(
            str(path), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self._sessions[style.model] = session
        return session

    def _run(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        import numpy as np

        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        original_alpha = image.split()[3]
        rgb = image.convert("RGB")

        # Downscale so the longest side <= max_size (fully-convolutional model
        # runs at any size; this bounds CPU cost). Never upscale.
        width, height = rgb.size
        scale = min(1.0, self._max_size / max(width, height))
        work = (
            rgb.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
            if scale < 1.0
            else rgb
        )

        tensor = np.asarray(work, dtype=np.float32).transpose(2, 0, 1)[None]  # 1,3,H,W (0-255)
        session = self._session(style)
        output = session.run(None, {session.get_inputs()[0].name: tensor})[0][0]
        styled = np.clip(output, 0, 255).astype(np.uint8).transpose(1, 2, 0)  # H,W,3

        result = Image.fromarray(styled, mode="RGB")
        if result.size != rgb.size:
            result = result.resize(rgb.size, Image.Resampling.LANCZOS)
        return _to_png_bytes(_merge_rgb_alpha(result, original_alpha))

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        # onnxruntime is synchronous + CPU-bound: run it off the event loop.
        return await asyncio.to_thread(self._run, png_bytes, style)


# ---------------------------------------------------------------------------
# Torch7 fast-neural-style (Johnson et al.'s original released models)
# ---------------------------------------------------------------------------


class TorchStyleProvider:
    """Runs a pretrained Torch7 fast-neural-style net through ``cv2.dnn``.

    Johnson released weights the ONNX Model Zoo never converted -- notably
    **Starry Night**, the actual Van Gogh style. OpenCV reads the ``.t7`` files
    directly, so no torch install is needed; it does require OpenCV 4.x, as
    OpenCV 5 dropped the Torch importer (hence the pin in pyproject).
    """

    name = "torch"
    #: These nets were trained on BGR input with the ImageNet mean subtracted.
    _MEAN = (103.939, 116.779, 123.68)

    def __init__(self, models_dir: str, max_size: int) -> None:
        self._models_dir = Path(models_dir)
        self._max_size = max_size

    def model_path(self, style: StyleSpec) -> Path:
        return self._models_dir / f"{style.model}.t7"

    def is_available(self, style: StyleSpec) -> bool:
        # A failed download leaves a tiny HTML error page behind; require real weights.
        path = self.model_path(style)
        return path.is_file() and path.stat().st_size > 1_000_000

    def _run(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        import cv2

        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        original_alpha = image.split()[3]
        rgb = image.convert("RGB")

        width, height = rgb.size
        scale = min(1.0, self._max_size / max(width, height))
        work = (
            rgb.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
            if scale < 1.0
            else rgb
        )
        bgr = cv2.cvtColor(np.asarray(work), cv2.COLOR_RGB2BGR)

        net = cv2.dnn.readNetFromTorch(str(self.model_path(style)))
        work_h, work_w = bgr.shape[:2]
        net.setInput(
            cv2.dnn.blobFromImage(
                bgr, 1.0, (work_w, work_h), self._MEAN, swapRB=False, crop=False
            )
        )
        out = net.forward()
        # The net's output can be a couple of pixels off the input (conv rounding),
        # so reshape from the ACTUAL output dims and resize back afterwards.
        planes = out.reshape(out.shape[1], out.shape[2], out.shape[3]).copy()
        for channel in range(3):
            planes[channel] += self._MEAN[channel]
        styled_bgr = np.clip(planes.transpose(1, 2, 0), 0, 255).astype(np.uint8)
        styled = cv2.cvtColor(styled_bgr, cv2.COLOR_BGR2RGB)

        result = Image.fromarray(styled, mode="RGB")
        if result.size != rgb.size:
            result = result.resize(rgb.size, Image.Resampling.LANCZOS)
        return _to_png_bytes(_merge_rgb_alpha(result, original_alpha))

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        return await asyncio.to_thread(self._run, png_bytes, style)


# ---------------------------------------------------------------------------
# AnimeGANv3 (Ghibli / Miyazaki style)
# ---------------------------------------------------------------------------


class AnimeStyleProvider:
    """Runs AnimeGANv3 (ONNX) -- the ``Hayao`` weights give Miyazaki backgrounds.

    Unlike the style-transfer nets this is NHWC with inputs scaled to [-1, 1], and
    its generator needs both dimensions to be a multiple of 8.
    """

    name = "anime"
    _MULTIPLE = 8

    def __init__(self, models_dir: str, max_size: int, intra_op_threads: int = 4) -> None:
        self._models_dir = Path(models_dir)
        self._max_size = max_size
        self._threads = intra_op_threads
        self._sessions: dict[str, ort.InferenceSession] = {}

    def model_path(self, style: StyleSpec) -> Path:
        return self._models_dir / f"{style.model}.onnx"

    def is_available(self, style: StyleSpec) -> bool:
        return self.model_path(style).is_file()

    def _session(self, style: StyleSpec) -> ort.InferenceSession:
        cached = self._sessions.get(style.model)
        if cached is not None:
            return cached
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = self._threads
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        session = ort.InferenceSession(
            str(self.model_path(style)), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self._sessions[style.model] = session
        return session

    def _run(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        original_alpha = image.split()[3]
        rgb = image.convert("RGB")

        width, height = rgb.size
        scale = min(1.0, self._max_size / max(width, height))
        work_w = max(self._MULTIPLE, int(width * scale) // self._MULTIPLE * self._MULTIPLE)
        work_h = max(self._MULTIPLE, int(height * scale) // self._MULTIPLE * self._MULTIPLE)
        work = np.asarray(rgb.resize((work_w, work_h), Image.Resampling.LANCZOS), np.float32)

        session = self._session(style)
        tensor = (work / 127.5 - 1.0)[None]
        out = np.asarray(session.run(None, {session.get_inputs()[0].name: tensor})[0])
        styled = ((np.squeeze(out) + 1.0) * 127.5).clip(0, 255).astype(np.uint8)

        result = Image.fromarray(styled, mode="RGB")
        if result.size != rgb.size:
            result = result.resize(rgb.size, Image.Resampling.LANCZOS)
        return _to_png_bytes(_merge_rgb_alpha(result, original_alpha))

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        return await asyncio.to_thread(self._run, png_bytes, style)


# ---------------------------------------------------------------------------
# Local provider: dispatches each style to its own engine
# ---------------------------------------------------------------------------


class LocalStyleProvider:
    """The default provider: fully local, no API keys.

    Routes each :class:`StyleSpec` by ``kind`` — pretrained fast-neural-style
    networks for the painterly styles, algorithmic filters for the graphic ones.
    :meth:`is_available` lets the caller skip styles whose (git-ignored) ONNX
    weights have not been downloaded yet, instead of failing the whole run.
    """

    name = "local"

    def __init__(self, settings: Settings) -> None:
        self._filter = FilterStyleProvider()
        self._engines: dict[str, Any] = {
            "onnx": OnnxStyleProvider(settings),
            "torch": TorchStyleProvider(settings.style_models_dir, settings.style_max_size),
            "anime": AnimeStyleProvider(
                settings.anime_models_dir, settings.style_max_size, settings.style_intra_op_threads
            ),
        }
        # Hosted GPT engine for styles flagged `hosted`, only in live mode with a
        # key. Mock mode never touches the paid API even if a key is present.
        self._openai: OpenAIImageStyleProvider | None = None
        if settings.openai_api_key and not settings.is_mock_mode:
            self._openai = OpenAIImageStyleProvider(settings)

    def _uses_gpt(self, style: StyleSpec) -> bool:
        return style.hosted and self._openai is not None

    def is_available(self, style: StyleSpec) -> bool:
        if self._uses_gpt(style):
            return True
        if style.kind == "filter":
            return True  # algorithmic styles need no weights
        engine = self._engines.get(style.kind)
        return bool(engine and engine.is_available(style))

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        if self._uses_gpt(style):
            # GPT reinterpretation is its own artwork — do NOT colour-preserve it.
            return await self._openai.stylize(png_bytes, style)  # type: ignore[union-attr]
        engine = self._engines.get(style.kind, self._filter)
        result: bytes = await engine.stylize(png_bytes, style)
        if style.preserve_color:
            # Local brushwork-only styles: drop the net's palette, keep the photo's.
            result = await asyncio.to_thread(keep_original_colour, result, png_bytes)
        return result


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

    @staticmethod
    def _edit_size(width: int, height: int) -> str:
        """Nearest supported gpt-image size that keeps the photo's orientation.

        Matching orientation keeps the reinterpretation close to the original
        framing, which is what lets it drop into the aligned per-layer reveal.
        """
        if width > height * 1.15:
            return "1536x1024"
        if height > width * 1.15:
            return "1024x1536"
        return "1024x1024"

    async def stylize(self, png_bytes: bytes, style: StyleSpec) -> bytes:
        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        original_alpha = image.split()[3]

        # Ask the model to REPAINT the scene in the style while holding the
        # composition, so the result still lines up with the photo's layers.
        prompt = (
            f"Repaint this exact photograph in the style of {style.prompt}. "
            "Keep the original composition, camera angle, and the position and "
            "scale of every element; do not add, remove, or move objects."
        )
        result_bytes = await self._request_edit(
            png_bytes, prompt, self._edit_size(image.width, image.height), style
        )

        # Resize back to the photo's exact frame so it registers with the layers.
        result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        if result.size != image.size:
            result = result.resize(image.size, Image.Resampling.LANCZOS)
        result.putalpha(original_alpha)
        return _to_png_bytes(result)

    async def _request_edit(
        self, png_bytes: bytes, prompt: str, size: str, style: StyleSpec
    ) -> bytes:
        """POST one image-edit request, retrying flaky rejections.

        Returns the decoded PNG bytes of the first successful response. Raises
        after :data:`_OPENAI_MAX_ATTEMPTS` on retriable failures, or immediately
        on a non-retriable status (e.g. 401 bad key), with the API's own error
        message attached for diagnosis.
        """
        last_error: Exception | None = None
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            for attempt in range(1, _OPENAI_MAX_ATTEMPTS + 1):
                try:
                    response = await client.post(
                        "https://api.openai.com/v1/images/edits",
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        data={"model": self._model, "prompt": prompt, "size": size, "n": "1"},
                        files={"image": ("photo.png", png_bytes, "image/png")},
                    )
                except httpx.TransportError as exc:  # network blip, DNS, timeout
                    last_error = exc
                    logger.warning(
                        "openai image edit transport error for '%s' (attempt %d/%d): %s",
                        style.id,
                        attempt,
                        _OPENAI_MAX_ATTEMPTS,
                        exc,
                    )
                else:
                    if response.status_code == 200:
                        payload: dict[str, Any] = response.json()
                        return base64.b64decode(payload["data"][0]["b64_json"])
                    detail = _summarize_openai_error(response)
                    last_error = RuntimeError(f"HTTP {response.status_code}: {detail}")
                    if response.status_code not in _OPENAI_RETRIABLE_STATUS and (
                        response.status_code < 500
                    ):
                        raise last_error
                    logger.warning(
                        "openai image edit HTTP %d for '%s' (attempt %d/%d): %s",
                        response.status_code,
                        style.id,
                        attempt,
                        _OPENAI_MAX_ATTEMPTS,
                        detail,
                    )
                if attempt < _OPENAI_MAX_ATTEMPTS:
                    await asyncio.sleep(_OPENAI_RETRY_BACKOFF_SECONDS * attempt)
        raise RuntimeError(
            f"OpenAI image edit failed for '{style.id}' after {_OPENAI_MAX_ATTEMPTS} attempts"
        ) from last_error


def _summarize_openai_error(response: httpx.Response) -> str:
    """Extract a short, safe error message from an OpenAI error response."""
    try:
        data = response.json()
    except ValueError:
        return response.text[:300]
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error.get("code") or error)
    return str(data)[:300]


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
    """Return the per-style router.

    :class:`LocalStyleProvider` handles everything: it routes each style flagged
    ``hosted`` to the OpenAI image model when a key is set and mode is live, and
    every other style (and all styles when no key is present) to the local
    engines. This keeps per-style routing + graceful local fallback in one place.
    """
    resolved = settings if settings is not None else get_settings()
    return LocalStyleProvider(resolved)
