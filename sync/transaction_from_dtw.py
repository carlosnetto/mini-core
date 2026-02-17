"""
DTW-Born Transaction Ingestion — monitors digital-twin/transaction/from-dtw/
for JSON files containing transactions that originated in the Digital Twin.
Creates each transaction locally (firing the full trigger chain), maps local
ID to DTW ID, and moves processed files to trash/.

Usage:
    cd sync
    pip install psycopg2-binary python-dotenv
    python transaction_from_dtw.py
"""

import json
import logging
import os
import shutil
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("transaction_from_dtw")

FROM_DTW_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "transaction", "from-dtw")
TRASH_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "transaction", "trash")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "banking_system"),
    "user": os.getenv("DB_USERNAME", "admin"),
    "password": os.getenv("DB_PASSWORD", "mysecretpassword"),
    "options": f"-c search_path={os.getenv('DB_SCHEMA', 'minicore')}",
}

POLL_SECONDS = 10


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------
def process_file(conn, filepath):
    filename = os.path.basename(filepath)

    with open(filepath) as f:
        entries = json.load(f)

    if not entries:
        log.info("%s — empty file, skipping", filename)
        return

    cur = conn.cursor()
    created = 0
    skipped = 0

    for entry in entries:
        dtw_transaction_id = entry["dtw_transaction_id"]

        # Idempotency: skip if this DTW transaction was already ingested
        cur.execute(
            "SELECT 1 FROM dtw_transaction_mapping WHERE dtw_transaction_id = %s",
            (dtw_transaction_id,),
        )
        if cur.fetchone():
            log.info("  %s already exists, skipping", dtw_transaction_id)
            skipped += 1
            continue

        # Create the transaction locally (fires full trigger chain)
        cur.execute(
            "INSERT INTO transactions "
            "  (account_id, transaction_code, amount, direction, status, "
            "   json_payload, effective_date, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
            "RETURNING transaction_id",
            (
                entry["account_id"],
                entry["transaction_code"],
                entry["amount"],
                entry["direction"],
                entry["status"],
                json.dumps(entry["json_payload"]) if entry.get("json_payload") else None,
                entry.get("effective_date"),
                entry.get("created_by", "DTW"),
            ),
        )
        local_transaction_id = cur.fetchone()[0]

        # Map local ID <-> DTW ID (SYNCED immediately — it came from DTW)
        cur.execute(
            "INSERT INTO dtw_transaction_mapping "
            "  (local_transaction_id, dtw_transaction_id, sync_status) "
            "VALUES (%s, %s, 'SYNCED')",
            (local_transaction_id, dtw_transaction_id),
        )

        created += 1
        log.info(
            "  %s -> local %s", dtw_transaction_id, local_transaction_id
        )

    conn.commit()

    os.makedirs(TRASH_DIR, exist_ok=True)
    shutil.move(filepath, os.path.join(TRASH_DIR, filename))

    log.info("%s — %d created, %d skipped", filename, created, skipped)


def poll(conn):
    if not os.path.isdir(FROM_DTW_DIR):
        return False

    files = sorted(
        f for f in os.listdir(FROM_DTW_DIR)
        if f.endswith(".json")
    )

    for filename in files:
        process_file(conn, os.path.join(FROM_DTW_DIR, filename))

    return len(files) > 0


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main():
    conn = psycopg2.connect(**DB_CONFIG)
    log.info("Polling %s every %ds…", FROM_DTW_DIR, POLL_SECONDS)

    while True:
        if not poll(conn):
            log.info("Waiting %ds…", POLL_SECONDS)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
