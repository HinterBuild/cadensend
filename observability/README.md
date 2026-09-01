# Observability Stack

Optional monitoring and observability services for Cadensend.

## Services

- **Prometheus** - Metrics collection and storage
- **Grafana** - Dashboards and visualization
- **OpenTelemetry Collector** - Trace aggregation

## Quick Start

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

Access:
- Grafana: http://localhost:3000 (default admin/password)
- Prometheus: http://localhost:9090

## Metrics

Control API exposes metrics at:
- `/metrics` - Prometheus format

Key metrics to monitor:
- `http_requests_total` - Request counts by endpoint
- `http_request_duration_seconds` - Latency histograms
- `database_connection_count` - PostgreSQL connections
- `redis_connected_clients` - Redis client count

## Tracing

The control API registers OpenTelemetry spans when configured. Traces are exported to:
- OTLP collector (default: `localhost:4317`)
- Environment: `OTEL_EXPORTER_OTLP_ENDPOINT`

## Dashboard

Import the Cadensend dashboard JSON from `dashboards/cadensend.json` (TODO).