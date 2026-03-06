#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/.env"

SCHEMA="${1:-${DB_SCHEMA}}"

docker exec global_banking_db psql \
  -U "${DB_USERNAME}" \
  -d "${DB_NAME}" \
  -c "\dt ${SCHEMA}.*"
