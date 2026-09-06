"""HTTP route tests (system-level within the AI engine process)."""


def test_healthz_returns_healthy(health_client):
    response = health_client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
