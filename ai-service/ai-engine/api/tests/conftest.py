"""Shared pytest fixtures for AI engine tests."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import health_routes


@pytest.fixture
def health_app() -> FastAPI:
    app = FastAPI()
    app.include_router(health_routes.router)
    return app


@pytest.fixture
def health_client(health_app: FastAPI) -> TestClient:
    return TestClient(health_app)
