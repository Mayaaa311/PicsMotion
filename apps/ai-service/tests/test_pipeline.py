"""Tests for the mock pipeline job lifecycle."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_job_returns_queued(client: TestClient) -> None:
    response = client.post("/pipeline/jobs", json={"imageUrl": "mock://input/photo.jpg"})
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "queued"
    assert body["stage"] == "queued"
    assert body["progress"] == 0.0
    assert body["id"]


def test_poll_job_progresses_to_completion(client: TestClient) -> None:
    create = client.post("/pipeline/jobs", json={"imageUrl": "mock://input/photo.jpg"})
    job_id = create.json()["id"]

    last_progress = 0.0
    final_status = None
    for _ in range(20):
        poll = client.get(f"/pipeline/jobs/{job_id}")
        assert poll.status_code == 200
        body = poll.json()
        assert body["progress"] >= last_progress
        last_progress = body["progress"]
        final_status = body["status"]
        if final_status == "completed":
            break

    assert final_status == "completed"
    assert last_progress == 1.0


def test_get_unknown_job_returns_404(client: TestClient) -> None:
    response = client.get("/pipeline/jobs/does-not-exist")
    assert response.status_code == 404


def test_cancel_job(client: TestClient) -> None:
    create = client.post("/pipeline/jobs", json={"imageUrl": "mock://input/photo.jpg"})
    job_id = create.json()["id"]

    cancel = client.post(f"/pipeline/jobs/{job_id}/cancel")
    assert cancel.status_code == 200
    body = cancel.json()
    assert body["status"] == "cancelled"
    assert body["stage"] == "cancelled"

    # A cancelled job stays cancelled when polled.
    poll = client.get(f"/pipeline/jobs/{job_id}")
    assert poll.json()["status"] == "cancelled"


def test_cancel_unknown_job_returns_404(client: TestClient) -> None:
    response = client.post("/pipeline/jobs/does-not-exist/cancel")
    assert response.status_code == 404
