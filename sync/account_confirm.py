"""
Account Confirmation — monitors digital-twin/account/confirm/ for bulk JSON
files (manually copied from written/), inserts confirmations into PostgreSQL,
and moves processed files to trash/.

Usage:
    cd sync
    pip install psycopg2-binary python-dotenv
    python account_confirm.py
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
log = logging.getLogger("account_confirm")

CONFIRM_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "account", "confirm")
TRASH_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "account", "trash")

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
        event_ids = [event["event_id"]]
        if "pre_event_id" in event:
            event_ids.append(event["pre_event_id"])
        for event_id in event_ids:
            dtw_confirmation = f"dtw-acct-{uuid.uuid4()}"
            cur.execute(
                "INSERT INTO outbox_accounts_confirmations (event_id, dtw_confirmation) "
                "VALUES (%s, %s) ON CONFLICT (event_id) DO NOTHING",
                (event_id, dtw_confirmation),
            )

    cur.execute(
        "UPDATE outbox_accounts_bulk SET confirmed_at = NOW() WHERE bulk_id = %s",
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
