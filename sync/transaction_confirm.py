"""
Transaction Confirmation — monitors digital-twin/transaction/confirm/ for bulk
JSON files (manually copied from written/), inserts confirmations into PostgreSQL,
maps local transaction IDs to DTW transaction IDs, and moves processed files to trash/.

Usage:
    cd sync
    pip install psycopg2-binary python-dotenv
    python transaction_confirm.py
"""

import json
import logging
import os
import shutil
import time
import uuid

import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("transaction_confirm")

CONFIRM_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "transaction", "confirm")
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
    bulk_id = int(filename.replace("bulk-", "").replace(".json", ""))

    with open(filepath) as f:
        events = json.load(f)

    if not events:
        log.info("Bulk %s — empty file, skipping", bulk_id)
        return

    cur = conn.cursor()

    for event in events:
        event_id = event["event_id"]
        transaction_id = event["transaction_id"]
        dtw_confirmation = f"dtw-txn-{uuid.uuid4()}"
        dtw_transaction_id = f"dtw-txn-{uuid.uuid4()}"

        cur.execute(
            "INSERT INTO outbox_transactions_confirmations (event_id, dtw_confirmation) "
            "VALUES (%s, %s) ON CONFLICT (event_id) DO NOTHING",
            (event_id, dtw_confirmation),
        )

        cur.execute(
            "INSERT INTO dtw_transaction_mapping "
            "  (local_transaction_id, dtw_transaction_id, sync_status) "
            "VALUES (%s, %s, 'SYNCED') "
            "ON CONFLICT (local_transaction_id) DO NOTHING",
            (transaction_id, dtw_transaction_id),
        )

    cur.execute(
        "UPDATE outbox_transactions_bulk SET confirmed_at = NOW() WHERE bulk_id = %s",
        (bulk_id,),
    )
    conn.commit()

    os.makedirs(TRASH_DIR, exist_ok=True)
    shutil.move(filepath, os.path.join(TRASH_DIR, filename))

    log.info("Bulk %s CONFIRMED — %d events", bulk_id, len(events))


def poll(conn):
    if not os.path.isdir(CONFIRM_DIR):
        return False

    files = sorted(
        f for f in os.listdir(CONFIRM_DIR)
        if f.startswith("bulk-") and f.endswith(".json")
    )

    for filename in files:
        process_file(conn, os.path.join(CONFIRM_DIR, filename))

    return len(files) > 0


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main():
    conn = psycopg2.connect(**DB_CONFIG)
    log.info("Polling %s every %ds…", CONFIRM_DIR, POLL_SECONDS)

    while True:
        if not poll(conn):
            log.info("Waiting %ds…", POLL_SECONDS)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
