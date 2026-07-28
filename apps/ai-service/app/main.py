"""FastAPI application for the AI service (Milestone 0, mock mode).

Exposes health/readiness probes, a masked provider-configuration report, and a
mock pipeline job API backed by an in-memory store. No network calls are made in
mock mode.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.config import get_settings
from app.jobs import PipelineJob, job_store
from app.separate import image_hash, separate_image
from app.stylize import stylize_scene

logger = logging.getLogger(__name__)

# Local dev origins are always allowed; extra ones (the deployed web URL) come
# from CORS_ALLOW_ORIGINS, and every *.vercel.app alias of this project is matched
# by regex so preview deployments work without reconfiguring.
ALLOWED_ORIGINS = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    *[o.strip() for o in get_settings().cors_allow_origins.split(",") if o.strip()],
]
VERCEL_ORIGIN_REGEX = r"https://picsmotion-stylepaint[a-z0-9-]*\.vercel\.app"

app = FastAPI(
    title="PicMotion AI Service",
    version="0.1.0",
    description="API-first AI interactive photo-to-2.5D backend.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=VERCEL_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CreateJobRequest(CamelModel):
    image_url: str = Field(min_length=1, description="Image reference or URL to process.")


class HealthResponse(BaseModel):
    status: str


class ReadyResponse(CamelModel):
    status: str
    checks: dict[str, str]


# ---------------------------------------------------------------------------
# Health / readiness
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health() -> HealthResponse:
    return HealthResponse(status="healthy")


@app.get("/ready", response_model=ReadyResponse, tags=["health"])
async def ready() -> ReadyResponse:
    settings = get_settings()
    report = settings.provider_status_report()
    checks = {
        "config": "ok",
        "jobStore": "ok",
        "providers": "ok" if report["ready"] else "degraded",
    }
    overall = "ready" if report["ready"] else "not_ready"
    return ReadyResponse(status=overall, checks=checks)


@app.get("/providers", tags=["providers"])
async def providers() -> dict[str, object]:
    """Provider readiness report. Secret values are always masked."""
    settings = get_settings()
    return settings.provider_status_report()


# ---------------------------------------------------------------------------
# Pipeline jobs
# ---------------------------------------------------------------------------


@app.post(
    "/pipeline/jobs",
    response_model=PipelineJob,
    status_code=status.HTTP_201_CREATED,
    tags=["pipeline"],
)
async def create_pipeline_job(payload: CreateJobRequest) -> PipelineJob:
    return job_store.create(payload.image_url)


@app.get("/pipeline/jobs/{job_id}", response_model=PipelineJob, tags=["pipeline"])
async def get_pipeline_job(job_id: str) -> PipelineJob:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


@app.post(
    "/pipeline/jobs/{job_id}/cancel",
    response_model=PipelineJob,
    tags=["pipeline"],
)
async def cancel_pipeline_job(job_id: str) -> PipelineJob:
    job = job_store.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


# ---------------------------------------------------------------------------
# Scene intake: upload a photo -> CPU layer separation -> served scene
# ---------------------------------------------------------------------------


class ProcessSceneResponse(CamelModel):
    scene_id: str = Field(description="Generated scene id (content hash).")
    base_url: str = Field(description="Web path prefix, e.g. /scenes/uploads/<id>/")
    scene_url: str = Field(description="Web path to scene.json")
    layers: int = Field(description="Number of layers produced.")


@app.post("/scenes/process", response_model=ProcessSceneResponse, tags=["scenes"])
async def process_scene(request: Request, file: UploadFile = File(...)) -> ProcessSceneResponse:
    """Separate an uploaded photo into a 3-layer interactive scene (CPU, no keys).

    Cached by content hash. Real per-object separation is the AI pipeline; this
    is the universal depth-band fallback so any photo becomes interactive now.
    """
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="expected an image upload"
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty upload")

    settings = get_settings()
    scene_id = image_hash(data)
    out_dir = os.path.join(settings.scenes_output_dir, "uploads", scene_id)
    scene_json = os.path.join(out_dir, "scene.json")

    if not os.path.exists(scene_json):
        try:
            separate_image(data, out_dir, scene_id, title=file.filename or "Uploaded photo")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"could not process image: {type(exc).__name__}",
            ) from exc

    # Restyle the whole photo into the art styles the "paint" brush reveals.
    # Non-fatal: the scene is fully usable (original layers) even if this fails.
    if not os.path.exists(os.path.join(out_dir, "styles", "manifest.json")):
        try:
            await stylize_scene(Path(out_dir))
        except Exception:  # noqa: BLE001
            logger.warning("style generation failed for scene %s", scene_id, exc_info=True)

    # The separator chooses its own layer shape (subject cutout vs depth bands),
    # so report what was actually written rather than a fixed count.
    with open(scene_json, encoding="utf-8") as f:
        layer_count = len(json.load(f).get("layers", []))

    # Absolute URL to THIS service, so the browser loads the uploaded scene's
    # assets from the backend (which generated them) rather than the web origin.
    # Prefer an explicit PUBLIC_API_BASE_URL when set to a real host (e.g. a
    # tunnel URL) — deterministic regardless of proxy quirks; otherwise derive
    # from the request (honours X-Forwarded-* via uvicorn --proxy-headers).
    configured = settings.public_api_base_url.strip()
    if configured and "localhost" not in configured and "127.0.0.1" not in configured:
        origin = configured.rstrip("/")
    else:
        origin = str(request.base_url).rstrip("/")
    base_url = f"{origin}/scenes/uploads/{scene_id}"
    return ProcessSceneResponse(
        scene_id=scene_id,
        base_url=f"{base_url}/",
        scene_url=f"{base_url}/scene.json",
        layers=layer_count,
    )


# Serve generated scene assets (uploads) so a browser on the web origin can load
# them cross-origin from this backend. Mounted AFTER the routes above so the
# POST /scenes/process route keeps precedence over this static prefix.
_scenes_dir = Path(get_settings().scenes_output_dir)
_scenes_dir.mkdir(parents=True, exist_ok=True)
app.mount("/scenes", StaticFiles(directory=str(_scenes_dir)), name="scenes")
