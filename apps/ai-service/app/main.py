"""FastAPI application for the AI service (Milestone 0, mock mode).

Exposes health/readiness probes, a masked provider-configuration report, and a
mock pipeline job API backed by an in-memory store. No network calls are made in
mock mode.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.config import get_settings
from app.jobs import PipelineJob, job_store

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
