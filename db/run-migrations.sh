#!/bin/bash
# Runs db/migrations/*.up.sql in order exactly once per database.
# Mounted as a Postgres initdb script so fresh volumes are migrated
# straight from the single source of truth (db/migrations).
set -e

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

echo "Applying migrations from ${MIGRATIONS_DIR}..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
EOSQL

for file in "$MIGRATIONS_DIR"/*.up.sql; do
    [ -e "$file" ] || continue
    version=$(basename "$file" .up.sql)
    applied=$(psql -tA --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c \
        "SELECT 1 FROM schema_migrations WHERE version = '$version'" | tr -d '[:space:]')
    if [ "$applied" = "1" ]; then
        echo "Skipping $version (already applied)"
        continue
    fi
    echo "Applying $version"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c \
        "INSERT INTO schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING"
done

echo "Migrations complete."
