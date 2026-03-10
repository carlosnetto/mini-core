#!/usr/bin/env bash
# db-update.sh — Apply pending Liquibase changesets to the database.
#
# Usage:
#   ./scripts/db-update.sh           # schema + reference data only
#   ./scripts/db-update.sh --seed    # also load seed/test data
#
# Requires:
#   - .env in the repo root (DB_HOST, DB_PORT, DB_NAME, DB_SCHEMA, DB_USERNAME, DB_PASSWORD)
#   - Docker running (Colima, Docker Desktop, or any compatible runtime)
#   - curl (to auto-download the PostgreSQL JDBC driver on first run)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
DRIVERS_DIR="$REPO_ROOT/drivers"
CHANGELOG_DIR="$REPO_ROOT/db"

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env not found at $ENV_FILE"
    echo "       Copy .env.example to .env and fill in your credentials."
    exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# ── JDBC driver ───────────────────────────────────────────────────────────────
if [ -z "$(ls "$DRIVERS_DIR"/*.jar 2>/dev/null)" ]; then
    echo "PostgreSQL JDBC driver not found. Downloading..."
    mkdir -p "$DRIVERS_DIR"
    curl -L -o "$DRIVERS_DIR/postgresql.jar" https://jdbc.postgresql.org/download/postgresql-42.7.5.jar
    echo ""
fi

# ── Liquibase contexts ────────────────────────────────────────────────────────
CONTEXTS=""
for arg in "$@"; do
    case "$arg" in
        --seed) CONTEXTS="seed" ;;
        *) echo "Unknown argument: $arg"; echo "Usage: $0 [--seed]"; exit 1 ;;
    esac
done

# ── Docker ────────────────────────────────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running."
    echo "       Start Colima with:  colima start"
    exit 1
fi

# ── Run Liquibase ─────────────────────────────────────────────────────────────
echo "Applying Liquibase changesets..."
[ -n "$CONTEXTS" ] && echo "  contexts : $CONTEXTS" || echo "  contexts : (none — seed data skipped)"
echo "  host     : ${DB_HOST}:${DB_PORT}"
echo "  database : ${DB_NAME}"
echo "  schema   : ${DB_SCHEMA}"
echo ""

docker run --rm \
    --network host \
    -v "$CHANGELOG_DIR":/liquibase/changelog \
    -v "$DRIVERS_DIR":/liquibase/lib \
    liquibase/liquibase \
    --defaults-file=/liquibase/changelog/liquibase.properties \
    --url="jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}" \
    --username="${DB_USERNAME}" \
    --password="${DB_PASSWORD}" \
    --default-schema-name="${DB_SCHEMA}" \
    ${CONTEXTS:+--contexts="$CONTEXTS"} \
    update

echo ""
echo "Done."
