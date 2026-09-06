# Testing

Cadensend uses layered tests across all services. Run everything:

```bash
make test
```

Or per layer:

| Layer | Type | Command |
| --- | --- | --- |
| control-api | unit | `make test-go-api` |
| control-worker | unit | `make test-go-worker` |
| ai-engine | unit + route | `make test-python` |
| web | unit (Jest/RTL) | `make test-frontend` |
| live stack | smoke | `make test-smoke` (requires `docker compose up`) |
| all + optional smoke | integration | `make test-integration` |

## Layout

```
backend/control-api/     *_test.go next to packages (handlers, middleware, service)
backend/control-worker/  *_test.go (delivery, scheduler)
ai-service/.../tests/    pytest modules + conftest.py
frontend/web/src/        __tests__/*.test.ts(x) beside features
scripts/                 test-smoke.sh, test-integration.sh
```

## Test types

- **Unit** — pure logic, mocks, no Docker (Go testify, pytest, Jest)
- **Route / system** — FastAPI `TestClient`, Gin `httptest` (in-process HTTP)
- **Smoke** — curl health endpoints when stack is running
- **Integration** — runs all unit suites; smoke only if services are up

## Adding tests

1. Put tests beside the code they cover (`foo_test.go`, `test_foo.py`, `__tests__/foo.test.ts`).
2. Prefer table-driven Go tests and pytest for Python services.
3. Mock external APIs (OpenRouter, Brevo) — never call live providers in CI.
4. For DB-dependent handlers, add sqlite/in-memory fixtures before expanding coverage.

## Dev dependencies

```bash
pip install -r ai-service/ai-engine/api/requirements-dev.txt
cd frontend/web && npm install
```
