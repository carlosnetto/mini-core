#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# unpack.sh
#
# Restores a mini-core transfer pack on the target machine.
# Usage: ./unpack.sh <path-to-transfer-pack.tar.gz>
#   OR:  run directly from inside an already-extracted tarball directory.
# ---------------------------------------------------------------------------

MINICORE_DIR="${HOME}/Git/mini-core"

echo "Mini-Core Unpack"
echo "================"

# If a tarball argument is provided, extract it to a temp dir and work from there
if [ $# -ge 1 ]; then
  TARBALL="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  if [ ! -f "${TARBALL}" ]; then
    echo "ERROR: File not found: $1" >&2
    exit 1
  fi
  TMPDIR_PACK="$(mktemp -d)"
  trap 'rm -rf "${TMPDIR_PACK}"' EXIT
  echo "--> Extracting ${TARBALL}..."
  tar -xzf "${TARBALL}" -C "${TMPDIR_PACK}" --strip-components=1
  PACK_DIR="${TMPDIR_PACK}"
else
  PACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

# 1. .env
ENV_SRC="${PACK_DIR}/mini-core.env"
if [ -f "${ENV_SRC}" ]; then
  if [ ! -d "${MINICORE_DIR}" ]; then
    echo "ERROR: ${MINICORE_DIR} not found — clone the repo first." >&2
    exit 1
  fi
  cp "${ENV_SRC}" "${MINICORE_DIR}/.env"
  echo "✓ .env → ${MINICORE_DIR}/.env"
fi

# Load credentials
if [ ! -f "${MINICORE_DIR}/.env" ]; then
  echo "ERROR: ${MINICORE_DIR}/.env not found — no credentials to load." >&2
  exit 1
fi
source "${MINICORE_DIR}/.env"

# 2. Schema restore
SCHEMA_SQL="${PACK_DIR}/minicore-schema.sql"
if [ -f "${SCHEMA_SQL}" ]; then
  echo "--> Restoring minicore schema into ${DB_NAME}..."
  if ! docker ps --format '{{.Names}}' | grep -q "^global_banking_db$"; then
    echo "ERROR: Docker container 'global_banking_db' is not running." >&2
    echo "       Start it, then run manually:"
    echo "       docker exec -i global_banking_db psql -U ${DB_USERNAME} -d ${DB_NAME} < ${SCHEMA_SQL}"
    exit 1
  fi
  docker exec -i global_banking_db psql \
    -U "${DB_USERNAME}" \
    -d "${DB_NAME}" \
    < "${SCHEMA_SQL}"
  echo "✓ Schema restored."
fi

echo ""
echo "Done. To seed test data:"
echo "  cd ${MINICORE_DIR} && LIQUIBASE_CONTEXTS=seed docker-compose up"
