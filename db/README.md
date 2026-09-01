# Database Migrations

SQL versioned migrations for PostgreSQL.

## Migration Format

- `XX_name.up.sql` - Apply migration
- `XX_name.down.sql` - Rollback migration

## Running Migrations

### Via Docker Compose (first boot)

Init scripts in `db/migrations-docker/` run automatically on first volume creation.

### Via API

The control API runs `EnsureAppSchema` on startup with `ALTER TABLE IF NOT EXISTS`.

### Via CLI

```bash
cd backend/control-api
./scripts/run_migrations.sh
```

## Current Migrations

| File | Description |
|------|-------------|
| 001_create_tables.up.sql | Core tables (users, series, issues, sources) |
| 002_add_workspace.up.sql | Workspace tenancy support |
| 003_schedule_add_status.up.sql | Delivery scheduling |
| 004_issue_states.up.sql | Issue lifecycle states |
| 005_source_series_id.up.sql | Source ownership reference |
| 006_issues_status_id.up.sql | Foreign key status |
| 007_integrity_and_features.up.sql | Token version, suppressed recipients |

## Backup

```bash
pg_dump -U cadensend -d cadensend > backup.sql
```

Qdrant is optional to backup (can rebuild from PostgreSQL + MinIO).