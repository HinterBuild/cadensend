#!/bin/sh
set -e

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):[0-9].*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:[0-9]*://[^:]*:\([0-9]*\)/.*|\1|p' | head -1)
if [ -z "$DB_PORT" ]; then
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\2|p')
fi
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}

i=0
while [ $i -lt 60 ]; do
  if python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('$DB_HOST', $DB_PORT)); s.close()" 2>/dev/null; then
    echo "PostgreSQL is reachable."
    break
  fi
  i=$((i + 1))
  echo "Waiting for PostgreSQL... ($i/60)"
  sleep 2
done

# Wait for Redis
echo "Waiting for Redis..."
REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's|redis://\([^:/]*\).*|\1|p')
REDIS_PORT=$(echo "$REDIS_URL" | sed -n 's|redis://[^:]*:\([0-9]*\).*|\1|p')
REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}

i=0
while [ $i -lt 30 ]; do
  if python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('$REDIS_HOST', $REDIS_PORT)); s.close()" 2>/dev/null; then
    echo "Redis is reachable."
    break
  fi
  i=$((i + 1))
  echo "Waiting for Redis... ($i/30)"
  sleep 2
done

# Start control API
/app/control-api &

# Start control worker
/app/control-worker &

# Start AI engine
cd /app/ai-engine/api && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &

# Start frontend
cd /app/frontend && node server.js &

# Wait for all background processes
wait
