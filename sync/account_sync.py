"""
Account Outbox Sync — listens for new outbox_accounts rows, creates bulks,
and writes JSON files to digital-twin/account/ simulating a Digital Twin send.
Files are written to writing/ first, then moved to written/ for atomic visibility.

Usage:
    cd sync
    pip install psycopg2-binary python-dotenv
    python account_sync.py
"""

import json
import logging
import os
import select
import shutil
import time
from datetime import date, datetime
from decimal import Decimal

import psycopg2
import psycopg2.extensions
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("account_sync")

WRITING_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "account", "writing")
WRITTEN_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "account", "written")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "banking_system"),
    "user": os.getenv("DB_USERNAME", "admin"),
    "password": os.getenv("DB_PASSWORD", "mysecretpassword"),
    "options": f"-c search_path={os.getenv('DB_SCHEMA', 'minicore')}",
}

SLEEP_SECONDS = 30


# ---------------------------------------------------------------------------
# JSON serialiser for Decimal / datetime / date
# ---------------------------------------------------------------------------
def json_serial(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------
def process_bulk(conn):
    cur = conn.cursor()

    # 1. Read cursor position
    cur.execute(
        "SELECT last_processed_event_id FROM sync_cursors "
        "WHERE cursor_name = 'dtw-account-sync'"
    )
    row = cur.fetchone()
    last_processed = row[0] if row else 0

    # 2. Find the max event_id right now
    cur.execute("SELECT MAX(event_id) FROM outbox_accounts")
    row = cur.fetchone()
    max_event_id = row[0] if row else None

    if max_event_id is None or max_event_id <= last_processed:
        log.info("No new events to process")
        return

    first_event_id = last_processed + 1
    last_event_id = max_event_id

    # 3. Create bulk — CREATED
    cur.execute(
        "INSERT INTO outbox_accounts_bulk (first_event_id, last_event_id, status) "
        "VALUES (%s, %s, 'CREATED') RETURNING bulk_id",
        (first_event_id, last_event_id),
    )
    bulk_id = cur.fetchone()[0]
    conn.commit()
    log.info(
        "Bulk %s CREATED  (events %s → %s)", bulk_id, first_event_id, last_event_id
    )

    # 4. Transition to SENDING
    cur.execute(
        "UPDATE outbox_accounts_bulk SET status = 'SENDING' WHERE bulk_id = %s",
        (bulk_id,),
    )
    conn.commit()
    log.info("Bulk %s SENDING", bulk_id)

    # 5. Fetch outbox rows in the range
    cur.execute(
        "SELECT event_id, operation_type, snapshot_type, "
        "       account_id, account_number, product_type, status, "
        "       available_balance, collected_balance, currency_code, "
        "       created_by, created_at, updated_at, event_created_at "
        "  FROM outbox_accounts "
        " WHERE event_id BETWEEN %s AND %s "
        " ORDER BY event_id",
        (first_event_id, last_event_id),
    )
    columns = [d[0] for d in cur.description]
    rows = [dict(zip(columns, r)) for r in cur.fetchall()]

    # 6. Build JSON payload — account_number + updated fields only
    skip_always = {"event_id", "operation_type", "snapshot_type", "event_created_at"}
    skip_on_update = skip_always | {"available_balance", "collected_balance"}
    events = []
    i = 0
    while i < len(rows):
        row = rows[i]

        if row["operation_type"] == "UPDATE" and row["snapshot_type"] == "PRE":
            # Pair PRE with the next POS row
            pre = row
            pos = rows[i + 1] if i + 1 < len(rows) else None
            if pos and pos["snapshot_type"] == "POS" and pos["account_id"] == pre["account_id"]:
                changes = {}
                for key in pre:
                    if key in skip_on_update:
                        continue
                    if pre[key] != pos[key]:
                        changes[key] = pos[key]
                events.append({
                    "event_id": pos["event_id"],
                    "pre_event_id": pre["event_id"],
                    "operation": "UPDATE",
                    "account_number": pos["account_number"],
                    "changes": changes,
                })
                i += 2
                continue

        if row["snapshot_type"] == "POS":
            # INSERT or unpaired POS — include all fields (balances included)
            data = {k: v for k, v in row.items() if k not in skip_always}
            events.append({
                "event_id": row["event_id"],
                "operation": row["operation_type"],
                "account_number": row["account_number"],
                "changes": data,
            })

        i += 1

    # 7. Write JSON file to writing/, then move to written/
    os.makedirs(WRITING_DIR, exist_ok=True)
    os.makedirs(WRITTEN_DIR, exist_ok=True)
    filename = f"bulk-{bulk_id}.json"
    writing_path = os.path.join(WRITING_DIR, filename)
    written_path = os.path.join(WRITTEN_DIR, filename)
    with open(writing_path, "w") as f:
        json.dump(events, f, indent=2, default=json_serial)
    shutil.move(writing_path, written_path)

    # 8. Transition to SENT + update cursor
    cur.execute(
        "UPDATE outbox_accounts_bulk SET status = 'SENT', sent_at = NOW() "
        "WHERE bulk_id = %s",
        (bulk_id,),
    )
    cur.execute(
        "UPDATE sync_cursors SET last_processed_event_id = %s, updated_at = NOW() "
        "WHERE cursor_name = 'dtw-account-sync'",
        (last_event_id,),
    )
    conn.commit()
    log.info(
        "Bulk %s SENT — %d events written to %s", bulk_id, len(events), written_path
    )


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main():
    # Listen connection (autocommit required for LISTEN/NOTIFY)
    listen_conn = psycopg2.connect(**DB_CONFIG)
    listen_conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
    listen_cur = listen_conn.cursor()
    listen_cur.execute("LISTEN outbox_accounts_new;")

    # Work connection (normal transactions)
    work_conn = psycopg2.connect(**DB_CONFIG)

    log.info("Listening for new outbox_accounts events…")

    # On startup, process any events that accumulated before we started
    process_bulk(work_conn)

    while True:
        log.info("Waiting for notifications…")
        select.select([listen_conn], [], [])
        listen_conn.poll()

        # Drain all pending notifications
        while listen_conn.notifies:
            listen_conn.notifies.pop(0)

        log.info("New events detected — sleeping %ds…", SLEEP_SECONDS)
        time.sleep(SLEEP_SECONDS)

        # Drain anything that arrived during sleep
        listen_conn.poll()
        while listen_conn.notifies:
            listen_conn.notifies.pop(0)

        process_bulk(work_conn)


if __name__ == "__main__":
    main()
