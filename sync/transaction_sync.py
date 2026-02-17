"""
Transaction Outbox Sync — listens for new outbox_transactions rows, creates bulks,
and writes JSON files to digital-twin/transaction/ simulating a Digital Twin send.
Files are written to writing/ first, then moved to written/ for atomic visibility.

Usage:
    cd sync
    pip install psycopg2-binary python-dotenv
    python transaction_sync.py
"""

import json
import logging
import os
import select
import shutil
import time
import uuid
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
log = logging.getLogger("transaction_sync")

WRITING_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "transaction", "writing")
WRITTEN_DIR = os.path.join(os.path.dirname(__file__), "..", "digital-twin", "transaction", "written")

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
        "WHERE cursor_name = 'dtw-transaction-sync'"
    )
    row = cur.fetchone()
    last_processed = row[0] if row else 0

    # 2. Find the max event_id right now
    cur.execute("SELECT MAX(event_id) FROM outbox_transactions")
    row = cur.fetchone()
    max_event_id = row[0] if row else None

    if max_event_id is None or max_event_id <= last_processed:
        log.info("No new events to process")
        return

    first_event_id = last_processed + 1
    last_event_id = max_event_id

    # 3. Create bulk — CREATED
    cur.execute(
        "INSERT INTO outbox_transactions_bulk (first_event_id, last_event_id, status) "
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
        "UPDATE outbox_transactions_bulk SET status = 'SENDING' WHERE bulk_id = %s",
        (bulk_id,),
    )
    conn.commit()
    log.info("Bulk %s SENDING", bulk_id)

    # 5. Fetch outbox rows in the range
    cur.execute(
        "SELECT event_id, operation_type, "
        "       transaction_id, account_id, original_transaction_id, "
        "       transaction_code, amount, direction, status, "
        "       json_payload, effective_date, created_by, created_at, "
        "       event_created_at "
        "  FROM outbox_transactions "
        " WHERE event_id BETWEEN %s AND %s "
        " ORDER BY event_id",
        (first_event_id, last_event_id),
    )
    columns = [d[0] for d in cur.description]
    rows = [dict(zip(columns, r)) for r in cur.fetchall()]

    # 5b. Query dtw_pre_auth for all transaction_ids in this batch
    txn_ids = [r["transaction_id"] for r in rows]
    pre_auth_map = {}  # transaction_id -> dtw_transaction_id
    if txn_ids:
        cur.execute(
            "SELECT local_transaction_id, dtw_transaction_id "
            "  FROM dtw_pre_auth "
            " WHERE local_transaction_id = ANY(%s)",
            (txn_ids,),
        )
        for pa_row in cur.fetchall():
            pre_auth_map[pa_row[0]] = pa_row[1]

    # 6. Build JSON payload (pre-auth aware)
    skip = {"event_id", "operation_type", "event_created_at"}
    events = []
    pre_auth_pending_count = 0
    pre_auth_posted_count = 0
    for row in rows:
        txn_id = row["transaction_id"]
        dtw_txn_id = pre_auth_map.get(txn_id)

        if dtw_txn_id and row["status"] == "PENDING":
            # Pre-auth exists + PENDING: transaction already exists in DTW as pending.
            # Skip from JSON, insert mapping and confirmation directly.
            cur.execute(
                "INSERT INTO dtw_transaction_mapping "
                "  (local_transaction_id, dtw_transaction_id, sync_status) "
                "VALUES (%s, %s, 'SYNCED') "
                "ON CONFLICT (local_transaction_id) DO NOTHING",
                (txn_id, dtw_txn_id),
            )
            dtw_confirmation = f"pre-auth-{uuid.uuid4()}"
            cur.execute(
                "INSERT INTO outbox_transactions_confirmations "
                "  (event_id, dtw_confirmation) "
                "VALUES (%s, %s) ON CONFLICT (event_id) DO NOTHING",
                (row["event_id"], dtw_confirmation),
            )
            pre_auth_pending_count += 1
            continue

        data = {k: v for k, v in row.items() if k not in skip}
        entry = {
            "event_id": row["event_id"],
            "operation": row["operation_type"],
            **data,
        }

        if dtw_txn_id and row["status"] == "POSTED":
            # Pre-auth exists + POSTED: DTW already has a pending transaction.
            # Include dtw_transaction_id so DTW posts the existing pending instead
            # of creating a new one.
            entry["dtw_transaction_id"] = dtw_txn_id
            pre_auth_posted_count += 1

        events.append(entry)

    if pre_auth_pending_count:
        conn.commit()
        log.info(
            "Bulk %s — %d PENDING pre-auth events auto-confirmed (skipped from JSON)",
            bulk_id, pre_auth_pending_count,
        )
    if pre_auth_posted_count:
        log.info(
            "Bulk %s — %d POSTED pre-auth events enriched with dtw_transaction_id",
            bulk_id, pre_auth_posted_count,
        )

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
        "UPDATE outbox_transactions_bulk SET status = 'SENT', sent_at = NOW() "
        "WHERE bulk_id = %s",
        (bulk_id,),
    )
    cur.execute(
        "UPDATE sync_cursors SET last_processed_event_id = %s, updated_at = NOW() "
        "WHERE cursor_name = 'dtw-transaction-sync'",
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
    listen_cur.execute("LISTEN outbox_transactions_new;")

    # Work connection (normal transactions)
    work_conn = psycopg2.connect(**DB_CONFIG)

    log.info("Listening for new outbox_transactions events…")

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
