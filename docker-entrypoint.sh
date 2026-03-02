#!/bin/sh
set -e

# Run migrations (idempotent - safe to run on every start)
echo "Running migrations..."
node scripts/add-ussd-sessions.js 2>/dev/null || true
node scripts/add-data-submissions.js 2>/dev/null || true

exec "$@"
