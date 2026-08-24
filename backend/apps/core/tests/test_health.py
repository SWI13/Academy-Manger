"""The one unauthenticated route in the API."""

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
def test_health_is_reachable_without_a_session(client):
    response = client.get("/api/v1/health/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_health_reports_each_dependency(client):
    body = client.get("/api/v1/health/").json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["cache"] == "ok"


@pytest.mark.django_db
def test_health_leaks_nothing_useful_to_an_attacker(client):
    """No versions, hostnames, paths or settings - this route is public."""
    body = client.get("/api/v1/health/").json()
    assert set(body) == {"status", "database", "cache"}
    assert set(body.values()) <= {"ok", "fail", "degraded"}
