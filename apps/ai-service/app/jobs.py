"""In-memory pipeline job store (Milestone 0).

A real implementation will persist jobs and drive stages via a task queue. For
M0 this store advances a mock job deterministically each time it is polled, so
clients can exercise the create -> poll -> complete flow entirely offline.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from threading import Lock

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# Ordered mock stages; the terminal stage is "completed".
PIPELINE_STAGES: list[str] = [
    "queued",
    "scene_analysis",
    "segmentation",
    "matting",
    "depth",
    "inpainting",
    "packaging",
    "completed",
]


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    completed = "completed"
    cancelled = "cancelled"
    failed = "failed"


class PipelineJob(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    status: JobStatus
    stage: str
    progress: float = Field(ge=0, le=1)
    image_ref: str
    created_at: str
    updated_at: str


def _now() -> str:
    return datetime.now(UTC).isoformat()


class JobStore:
    """Thread-safe in-memory job store with deterministic mock progression."""

    def __init__(self) -> None:
        self._jobs: dict[str, PipelineJob] = {}
        self._lock = Lock()

    def create(self, image_ref: str) -> PipelineJob:
        job_id = str(uuid.uuid4())
        timestamp = _now()
        job = PipelineJob(
            id=job_id,
            status=JobStatus.queued,
            stage=PIPELINE_STAGES[0],
            progress=0.0,
            image_ref=image_ref,
            created_at=timestamp,
            updated_at=timestamp,
        )
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> PipelineJob | None:
        """Return the job, advancing the mock pipeline one stage per poll."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.status in (JobStatus.completed, JobStatus.cancelled, JobStatus.failed):
                return job
            self._advance(job)
            return job

    def cancel(self, job_id: str) -> PipelineJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.status in (JobStatus.completed, JobStatus.cancelled, JobStatus.failed):
                return job
            job.status = JobStatus.cancelled
            job.stage = "cancelled"
            job.updated_at = _now()
            return job

    def _advance(self, job: PipelineJob) -> None:
        current_index = (
            PIPELINE_STAGES.index(job.stage) if job.stage in PIPELINE_STAGES else 0
        )
        next_index = min(current_index + 1, len(PIPELINE_STAGES) - 1)
        job.stage = PIPELINE_STAGES[next_index]
        job.progress = round(next_index / (len(PIPELINE_STAGES) - 1), 4)
        job.status = (
            JobStatus.completed if job.stage == "completed" else JobStatus.running
        )
        job.updated_at = _now()


job_store = JobStore()
