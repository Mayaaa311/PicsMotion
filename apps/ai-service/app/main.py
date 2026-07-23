"""FastAPI application for the AI service (Milestone 0, mock mode).

Exposes health/readiness probes, a masked provider-configuration report, and a
mock pipeline job API backed by an in-memory store. No network calls are made in
mock mode.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.config import get_settings
from app.jobs import PipelineJob, job_store
from app.separate import image_hash, separate_image

ALLOWED_ORIGINS = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
]

app = FastAPI(
    title="PicMotion AI Service",
    version="0.1.0",
    description="API-first AI interactive photo-to-music backend (mock mode).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
async def process_scene(file: UploadFile = File(...)) -> ProcessSceneResponse:
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

    base_url = f"/scenes/uploads/{scene_id}"
    return ProcessSceneResponse(
        scene_id=scene_id,
        base_url=f"{base_url}/",
        scene_url=f"{base_url}/scene.json",
        layers=3,
    )
