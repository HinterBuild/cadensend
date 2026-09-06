.PHONY: test test-go test-go-api test-go-worker test-python test-frontend test-integration test-smoke

test: test-go test-python test-frontend

test-go: test-go-api test-go-worker

test-go-api:
	cd backend/control-api && go test ./... -count=1

test-go-worker:
	cd backend/control-worker && go test ./... -count=1

test-python:
	pip install -q -r ai-service/ai-engine/api/requirements.txt -r ai-service/ai-engine/api/requirements-dev.txt
	python -m pytest ai-service/ai-engine/api/tests/ -v --tb=short

test-frontend:
	cd frontend/web && npm test -- --ci --passWithNoTests

test-integration:
	./scripts/test-integration.sh

test-smoke:
	./scripts/test-smoke.sh
