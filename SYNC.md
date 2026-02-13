# Synchronization Strategy

## The Problem

A mid-size US bank processes hundreds of millions of transactions per month. Every account change and every new transaction in the core banking system must be replicated to Matera's Digital Twin — reliably, in order, and without losing anything.

Sending events one by one would be catastrophically slow. Waiting for a confirmation before sending the next event would be even worse. And querying a table with hundreds of millions of rows to find out "what hasn't been confirmed yet" would grind everything to a halt.

This document explains how the sync architecture solves all three problems.

## Outbox Pattern

The outbox tables (`outbox_accounts`, `outbox_transactions`) are the foundation. Instead of calling an external API from application code (which can fail silently, leave partial state, or lose events on crash), we let database triggers capture every change into outbox tables within the same transaction that made the change.

**For transactions:**
A trigger fires AFTER INSERT on the `transactions` table and writes a complete copy of the row into `outbox_transactions`. Since transactions are immutable (never updated), this is always an INSERT event.

**For accounts:**
A trigger fires AFTER INSERT OR UPDATE on the `accounts` table and writes into `outbox_accounts`. For UPDATEs (which happen on every balance change), it writes **two rows**: a PRE snapshot (the account state before the change) and a POS snapshot (the state after). This makes it trivial to see exactly what changed without diffing.

The outbox tables mirror the actual columns of the source tables — no JSONB blobs. This makes them directly queryable and easy to inspect.

**The guarantee:** if the business operation committed, the outbox row exists. If it rolled back, the outbox row doesn't. No dual-write problem.

## Bulk Sends

### Why Bulks Matter

In an environment doing hundreds of millions of transactions per month, that's roughly 3-4 million transactions per day, or 40+ per second sustained. Sending these one at a time would mean:

- 40+ HTTP round-trips per second, each with TCP overhead, TLS handshake amortization, serialization, and acknowledgment
- Massive connection pool pressure on both sides
- No ability to optimize payload encoding across related events

Bulking changes everything.

### How It Works

The `outbox_accounts_bulk` and `outbox_transactions_bulk` tables group outbox events into ranges:

```
bulk_id | first_event_id | last_event_id | status  | sent_at | confirmed_at
--------+----------------+---------------+---------+---------+-------------
     1  |              1 |           500 | SENT    | 10:00   | 10:01
     2  |            501 |          1200 | SENT    | 10:05   | 10:06
     3  |           1201 |          1850 | SENDING | NULL    | NULL
     4  |           1851 |          2400 | CREATED | NULL    | NULL
```

A sync process periodically:
1. Queries unprocessed outbox events (using the partial index `WHERE processed = false`)
2. Creates a bulk record covering a range of event IDs — status: **CREATED**
3. Serializes the events in the range (see "Wire Format" below)
4. Updates the bulk to **SENDING** and transmits the payload
5. On successful transmission, updates to **SENT** and records `sent_at`

The bulk size is tunable. Larger bulks = fewer round-trips but higher latency. Smaller bulks = lower latency but more overhead. In practice, bulks of 500-2000 events hit a sweet spot.

### Wire Format

The events in a bulk are serialized as **Apache Avro binaries**. Avro is ideal for this use case:

- **Schema-based** — the schema is registered once and referenced by ID, so it doesn't repeat in every message
- **Compact binary encoding** — dramatically smaller than JSON, especially for numeric fields like balances and amounts
- **Schema evolution** — new fields can be added without breaking existing consumers

For large bulks, the Avro binary is additionally compressed (e.g., Snappy or Zstandard) before transmission. A bulk of 1,000 transaction events that would be ~2MB as JSON becomes ~200KB as compressed Avro. Over millions of events per day, this saves terabytes of bandwidth per month.

## Sync Wait Confirmation

### The "Small Table" Strategy

This is the most important performance design in the sync architecture.

Imagine you need to answer: "Which events have been sent but not yet confirmed by Digital Twin?" If you query the outbox table (which has hundreds of millions of rows) and LEFT JOIN against the confirmations table, you're doing a massive scan every time. Even with indexes, this gets expensive fast.

Instead, we maintain a dedicated table that **only contains events waiting for confirmation**:

```
outbox_transactions_sync_wait_confirmation
outbox_accounts_sync_wait_confirmation
```

These tables are kept small by two triggers:

**Auto-populate on bulk creation:**
When a new bulk is inserted, a trigger automatically creates one row per event in the bulk's range. Each row references both the `event_id` (the specific outbox event) and the `bulk_id` (so you can see when it was sent).

```
INSERT INTO outbox_transactions_bulk (first_event_id, last_event_id)
  -- trigger fires automatically:
  --> INSERT INTO outbox_transactions_sync_wait_confirmation (event_id, bulk_id)
      for each event in [first_event_id, last_event_id]
```

**Auto-delete on confirmation:**
When Digital Twin confirms a specific event (by inserting into the confirmations table), a trigger automatically deletes the corresponding row from the sync wait table.

```
INSERT INTO outbox_transactions_confirmations (event_id, dtw_confirmation)
  -- trigger fires automatically:
  --> DELETE FROM outbox_transactions_sync_wait_confirmation
      WHERE event_id = <confirmed event_id>
```

### Why This Works

In steady state, this table contains only the events from the last few unconfirmed bulks — typically a few thousand rows at most, even in a system processing millions of events per day.

Querying it is instant:

```sql
-- What's stuck? (events waiting confirmation for more than 5 minutes)
SELECT sw.event_id, sw.bulk_id, b.sent_at
FROM minicore.outbox_transactions_sync_wait_confirmation sw
JOIN minicore.outbox_transactions_bulk b ON b.bulk_id = sw.bulk_id
WHERE b.sent_at < NOW() - INTERVAL '5 minutes';
```

This query touches a table with maybe 2,000 rows instead of 200 million. The difference is the difference between 0.1ms and 30 seconds.

## Confirmations

Digital Twin processes events asynchronously. A bulk may contain 1,000 events, but DTW confirms them individually as it processes each one. This is intentional — it allows DTW to:

- Process events at its own pace
- Report failures per event, not per bulk
- Confirm events from different bulks in any order

Each confirmation is recorded in `outbox_transactions_confirmations` or `outbox_accounts_confirmations`:

```
event_id | dtw_confirmation          | created_at
---------+---------------------------+-----------
   42001 | dtw-txn-a8f3e2c1-...     | 2025-01-15 10:01:23
   42002 | dtw-txn-b7d4f1a0-...     | 2025-01-15 10:01:24
```

The `dtw_confirmation` field holds whatever reference Digital Twin returns — typically a unique ID from their system. The existence of the row is what matters: if it's there, the event was confirmed.

## End-to-End Flow

```
1. Business operation (e.g., deposit)
   |
   v
2. INSERT INTO transactions
   |  (trigger chain fires)
   |-> UPDATE accounts (balance change)
   |     |-> INSERT outbox_accounts (PRE + POS snapshots)
   |-> INSERT transaction_balances (running balance snapshot)
   |-> INSERT outbox_transactions (full transaction copy)
   |
   v
3. Sync process picks up unprocessed outbox events
   |
   v
4. INSERT INTO outbox_transactions_bulk (first=N, last=M)
   |  (trigger fires)
   |-> INSERT INTO outbox_transactions_sync_wait_confirmation
   |   (one row per event in range)
   |
   v
5. Serialize events as Avro, compress, send to Digital Twin
   |-> UPDATE bulk SET status='SENT', sent_at=NOW()
   |
   v
6. Digital Twin processes events asynchronously
   |
   v
7. For each confirmed event:
   INSERT INTO outbox_transactions_confirmations (event_id, dtw_confirmation)
   |  (trigger fires)
   |-> DELETE FROM outbox_transactions_sync_wait_confirmation
       WHERE event_id = <confirmed>
```

## Monitoring

The sync wait tables are the primary monitoring surface:

| Query | Purpose |
|-------|---------|
| `SELECT COUNT(*) FROM outbox_transactions_sync_wait_confirmation` | How many events are in flight? Should be small. |
| `... JOIN bulk WHERE sent_at < NOW() - INTERVAL '5 min'` | What's stuck? Events sent but not confirmed. |
| `... JOIN bulk WHERE status = 'CREATED'` | What hasn't been sent yet? |
| `SELECT COUNT(*) FROM outbox_transactions WHERE processed = false` | How many events haven't been bulked yet? |

In a healthy system:
- The sync wait tables have at most a few thousand rows (the last 1-2 unsent/unconfirmed bulks)
- Events move from outbox to bulk to confirmed within seconds
- The "stuck" query returns zero rows

An unhealthy system shows:
- Growing sync wait table (confirmations not coming back)
- Growing unprocessed outbox events (bulk creation falling behind)
- Old `sent_at` timestamps in bulk table (Digital Twin not responding)
