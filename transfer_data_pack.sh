#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# transfer_data_pack.sh
#
# Packs mini-core DB credentials and PostgreSQL schema dump into a tarball.
#
# Output: ~/mini-core-transfer-YYYYMMDD-HHMMSS.tar.gz
# ---------------------------------------------------------------------------

MINICORE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
INCLUDE_DATA=false

for arg in "$@"; do
  case "$arg" in
    --transferdata) INCLUDE_DATA=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

PACK_NAME="mini-core-transfer-${TIMESTAMP}"
TMP_DIR="/tmp/${PACK_NAME}"
OUTPUT="${HOME}/${PACK_NAME}.tar.gz"

# Load DB credentials from .env
ENV_FILE="${MINICORE_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: .env not found at ${ENV_FILE}" >&2
  exit 1
fi
source "${ENV_FILE}"

echo "==> Creating transfer pack: ${PACK_NAME}"
mkdir -p "${TMP_DIR}"

# 1. .env
echo "--> Copying .env..."
cp "${ENV_FILE}" "${TMP_DIR}/mini-core.env"

# 2. PostgreSQL dump
if [ "${INCLUDE_DATA}" = true ]; then
  echo "--> Dumping PostgreSQL schema + data (${DB_SCHEMA})..."
else
  echo "--> Dumping PostgreSQL schema only (${DB_SCHEMA})..."
fi
if ! docker ps --format '{{.Names}}' | grep -q "^global_banking_db$"; then
  echo "ERROR: Docker container 'global_banking_db' is not running." >&2
  exit 1
fi
DUMP_FLAGS="--schema=${DB_SCHEMA} --no-owner --no-acl"
if [ "${INCLUDE_DATA}" = false ]; then
  DUMP_FLAGS="${DUMP_FLAGS} --schema-only"
fi
docker exec global_banking_db pg_dump \
  -U "${DB_USERNAME}" \
  -d "${DB_NAME}" \
  ${DUMP_FLAGS} \
  > "${TMP_DIR}/minicore-schema.sql"
echo "    $(wc -l < "${TMP_DIR}/minicore-schema.sql") lines written"

# 3. Include unpack.sh
cp "${MINICORE_DIR}/unpack.sh" "${TMP_DIR}/unpack.sh"
chmod +x "${TMP_DIR}/unpack.sh"

# 4. Pack
echo "--> Packing..."
tar -czf "${OUTPUT}" -C /tmp "${PACK_NAME}"
rm -rf "${TMP_DIR}"

SIZE=$(du -sh "${OUTPUT}" | cut -f1)
echo ""
echo "✓ ${OUTPUT} (${SIZE})"
echo ""
echo "  On the target machine:"
echo "    tar -xzf ${PACK_NAME}.tar.gz"
echo "    bash ${PACK_NAME}/unpack.sh"
