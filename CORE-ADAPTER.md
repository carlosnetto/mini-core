# Core Adapter

## What Is the Core Adapter?

In production, the **Core Adapter** is the set of tables, processes, and conventions that sit between an existing core banking system and Matera's Digital Twin (DTW). It is not part of the core itself — it's the synchronization layer that makes two systems look like one.

In Mini-Core, every database object outside the core banking tables (`accounts`, `transactions`, `transaction_balances`) and the reference tables (`currencies`, `balances`, `transaction_codes`, `transaction_code_balance_effects`) belongs to the Core Adapter:

```
Core Adapter tables:
  outbox_accounts                              CDC capture
  outbox_transactions                          CDC capture
  outbox_accounts_bulk                         Batch control
  outbox_transactions_bulk                     Batch control
  outbox_accounts_sync_wait_confirmation       Small-table monitoring
  outbox_transactions_sync_wait_confirmation   Small-table monitoring
  outbox_accounts_confirmations                DTW acknowledgments
  outbox_transactions_confirmations            DTW acknowledgments
  dtw_transaction_mapping                      Local ↔ DTW ID map
  sync_cursors                                 Sync process bookmarks

Core Adapter processes:
  account_sync.py                              Mini-Core → DTW (accounts)
  transaction_sync.py                          Mini-Core → DTW (transactions)
  account_confirm.py                           DTW → Mini-Core (account confirmations)
  transaction_confirm.py                       DTW → Mini-Core (transaction confirmations)
  transaction_from_dtw.py                      DTW → Mini-Core (DTW-born transactions)
```

The core banking system doesn't know the Core Adapter exists. Its triggers fire, balances update, and outbox rows appear — but it has no awareness of bulks, confirmations, or the Digital Twin. The Core Adapter reads the outbox, talks to DTW, and writes back confirmations and new transactions. All coupling is one-directional: the adapter depends on the core, never the reverse.

---

## Sync Directions

### Accounts: One-Directional (Mini-Core → DTW)

Accounts are mastered in the core. The Digital Twin receives account changes but never creates or modifies accounts. The flow is strictly one-way:

```
Mini-Core                          Digital Twin
─────────                          ────────────
accounts table
  → outbox_accounts (trigger)
       → bulk → send → confirm
                                   Receives account data
                                   Confirms receipt
```

The DTW may display account information and use it for its own operations, but any account change originates in the core and flows outward.

### Transactions: Bidirectional

Transactions can be born in either system. A deposit at a branch originates in Mini-Core. A Pix payment initiated through a mobile app originates in the Digital Twin. Both must end up in both systems.

```
Mini-Core → DTW (outbound)         DTW → Mini-Core (inbound)
──────────────────────────         ────────────────────────────
Transaction created locally        Transaction created in DTW
  → outbox trigger                   → DTW sends to Core Adapter
       → bulk → send                      → Core Adapter creates transaction locally
                                          → Core Adapter maps local ID ↔ DTW ID
  ← DTW confirms with dtw_id        ← Done (transaction exists in both systems)
  → Core Adapter maps IDs
```

---

## Outbound: Mini-Core → DTW

### Outbox Pattern

The outbox tables (`outbox_accounts`, `outbox_transactions`) are the foundation. Instead of calling an external API from application code (which can fail silently, leave partial state, or lose events on crash), database triggers capture every change into outbox tables within the same transaction that made the change.

**For transactions:**
A trigger fires AFTER INSERT on the `transactions` table and writes a complete copy of the row into `outbox_transactions`. Since transactions are immutable (never updated), this is always an INSERT event.

**For accounts:**
A trigger fires AFTER INSERT OR UPDATE on the `accounts` table and writes into `outbox_accounts`. For UPDATEs, it writes **two rows**: a PRE snapshot (the account state before the change) and a POS snapshot (the state after). Balance-only updates are skipped — the Digital Twin computes its own balances from the transactions it receives.

The outbox tables mirror the actual columns of the source tables — no JSONB blobs. This makes them directly queryable and easy to inspect.

**The guarantee:** if the business operation committed, the outbox row exists. If it rolled back, the outbox row doesn't. No dual-write problem.

### Bulk Sends

#### Why Bulks Matter

In an environment doing hundreds of millions of transactions per month, that's roughly 3-4 million transactions per day, or 40+ per second sustained. Sending these one at a time would mean:

- 40+ HTTP round-trips per second, each with TCP overhead, TLS handshake amortization, serialization, and acknowledgment
- Massive connection pool pressure on both sides
- No ability to optimize payload encoding across related events

Bulking changes everything.

#### How It Works

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
1. Finds events not yet bulked by selecting those with `event_id` greater than the `last_event_id` of the most recent bulk (or from the beginning if no bulk exists yet)
2. Creates a bulk record covering a range of event IDs — status: **CREATED**
3. Serializes the events in the range (see "Wire Format" below)
4. Updates the bulk to **SENDING** and transmits the payload
5. On successful transmission, updates to **SENT** and records `sent_at`

The bulk size is tunable. Larger bulks = fewer round-trips but higher latency. Smaller bulks = lower latency but more overhead. In practice, bulks of 500-2000 events hit a sweet spot.

#### Wire Format

The events in a bulk are serialized as **Apache Avro binaries**. Avro is ideal for this use case:

- **Schema-based** — the schema is registered once and referenced by ID, so it doesn't repeat in every message
- **Compact binary encoding** — dramatically smaller than JSON, especially for numeric fields like balances and amounts
- **Schema evolution** — new fields can be added without breaking existing consumers

For large bulks, the Avro binary is additionally compressed (e.g., Snappy or Zstandard) before transmission. A bulk of 1,000 transaction events that would be ~2MB as JSON becomes ~200KB as compressed Avro. Over millions of events per day, this saves terabytes of bandwidth per month.

### Sync Wait Confirmation

#### The "Small Table" Strategy

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

#### Why This Works

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

---

## Inbound: DTW → Mini-Core

### The Problem

When a transaction is born in the Digital Twin (e.g., a Pix payment initiated through a mobile app, an instant payment via RTP/FedNow, a card purchase processed by the payment network), the core banking system needs to know about it. The transaction must be created locally so that balances update, the outbox captures it, and the core's ledger remains the authoritative record.

### Same Format, Two Meanings

The response channel from Digital Twin to Mini-Core (the confirmation files) carries **two types of entries** in a single payload:

1. **Confirmations** — DTW acknowledging receipt of a transaction that Mini-Core sent. These entries have a `transaction_id` (the local ID) because the transaction already exists locally.

2. **DTW-born transactions** — New transactions that originated in the Digital Twin. These entries have **no `transaction_id`** because the transaction doesn't exist in Mini-Core yet. They do have a `dtw_transaction_id` and all the transaction data needed to create it locally.

The Core Adapter distinguishes between the two by a simple rule:

- **`transaction_id` present** → this is a confirmation. Insert into `outbox_transactions_confirmations` and map the IDs in `dtw_transaction_mapping`.
- **`transaction_id` absent** → this is a DTW-born transaction. Create the transaction locally, then map the resulting local ID to the `dtw_transaction_id`.

```
DTW response file (single payload, two types of entries):

  ┌──────────────────────────────────────────────────────┐
  │ { "event_id": 42001,                                 │
  │   "transaction_id": 100005,         ← exists locally │
  │   "dtw_transaction_id": "dtw-..." }                  │
  │                                                      │
  │   → CONFIRMATION: acknowledge outbox event,          │
  │     insert into confirmations table,                 │
  │     create ID mapping                                │
  ├──────────────────────────────────────────────────────┤
  │ { "dtw_transaction_id": "dtw-...",                   │
  │   "account_id": 1000,              ← no local ID    │
  │   "transaction_code": 10001,                         │
  │   "amount": 500.00,                                  │
  │   "direction": "CREDIT",                             │
  │   "status": "POSTED",                                │
  │   "effective_date": "2026-02-16",                    │
  │   ... }                                              │
  │                                                      │
  │   → DTW-BORN: create transaction locally,            │
  │     map new local ID ↔ dtw_transaction_id            │
  └──────────────────────────────────────────────────────┘
```

### DTW-Born Transaction Flow

When the Core Adapter encounters an entry without a `transaction_id`:

1. **Create the transaction locally** — INSERT into `transactions` with the data from the DTW entry. This fires the full trigger chain: lifecycle validation, balance update, balance snapshot, outbox capture.

2. **Map the IDs** — INSERT into `dtw_transaction_mapping` linking the newly generated local `transaction_id` to the `dtw_transaction_id` from the entry. The sync status is set to SYNCED immediately (the transaction came from DTW, so it's already there).

3. **No outbox confirmation needed** — The outbox trigger fires on the local INSERT (it always does), creating a new outbox event. But this event does not need to be sent back to DTW — the Digital Twin already has this transaction. The Core Adapter must recognize outbox events originating from DTW-born transactions and skip them during the next bulk. The `dtw_transaction_mapping` table serves as the signal: if a transaction has a mapping with `sync_status = SYNCED`, its outbox event can be excluded from outbound bulks.

```
DTW response arrives
  │
  ├─ entry has transaction_id?
  │     YES → Confirmation flow (existing)
  │           Insert into outbox_transactions_confirmations
  │           Insert into dtw_transaction_mapping (local_id ↔ dtw_id)
  │
  │     NO  → DTW-born transaction flow
  │           INSERT INTO transactions (fires full trigger chain)
  │             → balances update
  │             → transaction_balances snapshot created
  │             → outbox_transactions row created (will be skipped in outbound sync)
  │           INSERT INTO dtw_transaction_mapping (new local_id ↔ dtw_id, SYNCED)
```

### Why DTW-Born Transactions Don't Bounce Back

A naive implementation would create an infinite loop: DTW sends a transaction → Core Adapter creates it locally → outbox captures it → sync process sends it back to DTW → DTW sends a confirmation → which looks like a new transaction → and so on.

The `dtw_transaction_mapping` table breaks this cycle. During outbound sync, the sync process can join against `dtw_transaction_mapping` to exclude transactions that already have a mapping with `sync_status = SYNCED`. These transactions are already in the Digital Twin — sending them back would be redundant at best and dangerous at worst.

```sql
-- Outbound sync: only send transactions NOT already in DTW
SELECT ot.*
FROM outbox_transactions ot
LEFT JOIN dtw_transaction_mapping m ON m.local_transaction_id = ot.transaction_id
WHERE ot.event_id BETWEEN :first AND :last
  AND m.local_transaction_id IS NULL;   -- no mapping = born locally, needs to be sent
```

### Credit-Only Constraint

DTW-born transactions are typically **credits** (deposits, incoming payments, received transfers). The existing database constraint — credit transactions cannot be PENDING, only POSTED — aligns naturally with this flow. Transactions arriving from DTW are already settled; they enter the core as POSTED.

Debit transactions (withdrawals, purchases, outgoing payments) are always initiated in the core and flow outward. The Digital Twin doesn't initiate debits against the core.

---

## The ID Mapping Problem

The `dtw_transaction_mapping` table is central to bidirectional sync. It answers two questions:

1. **Given a local transaction, what's the DTW ID?** — needed when DTW queries or references a transaction.
2. **Given a DTW transaction ID, does it already exist locally?** — needed to prevent duplicate creation on retry.

| Column | Type | Notes |
|--------|------|-------|
| `local_transaction_id` | BIGINT PK | FK to `transactions` |
| `dtw_transaction_id` | VARCHAR(64) | UNIQUE. Digital Twin's identifier. |
| `sync_status` | sync_status_enum | PENDING, SYNCED, FAILED, RECONCILED |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

For **outbound transactions** (born in Mini-Core), the mapping is created when DTW confirms receipt. The `sync_status` starts at PENDING (when the bulk is sent) and moves to SYNCED (when confirmation arrives).

For **inbound transactions** (born in DTW), the mapping is created at the same time as the local transaction. The `sync_status` is SYNCED immediately — the transaction came from DTW, so it's already there.

The UNIQUE constraint on `dtw_transaction_id` provides **idempotency**. If the same DTW response file is processed twice (e.g., after a crash and restart), the second attempt to insert the mapping will fail, and the Core Adapter can safely skip the duplicate.

---

## End-to-End Flows

### Outbound: Transaction Born in Mini-Core

```
1. Business operation (e.g., branch deposit)
   │
   v
2. INSERT INTO transactions
   │  (trigger chain fires)
   │→ UPDATE accounts (balance change)
   │→ INSERT transaction_balances (running balance snapshot)
   │→ INSERT outbox_transactions (full transaction copy)
   │     │→ pg_notify('outbox_transactions_new') wakes sync process
   │
   v
3. Sync process (transaction_sync.py):
   │  Woken by LISTEN/NOTIFY, sleeps 30s to batch, then:
   │
   v
4. INSERT INTO outbox_transactions_bulk (first=N, last=M)
   │  (trigger fires)
   │→ INSERT INTO outbox_transactions_sync_wait_confirmation
   │   (one row per event in range)
   │
   v
5. Write JSON to digital-twin/transaction/writing/, move to written/
   │→ UPDATE bulk SET status='SENT', sent_at=NOW()
   │
   v
6. DTW processes the transaction, responds with confirmation
   │
   v
7. Confirm process (transaction_confirm.py):
   │  Reads confirmation, sees transaction_id is present:
   │
   v
8. INSERT INTO outbox_transactions_confirmations (event_id, dtw_confirmation)
   │  (trigger fires)
   │→ DELETE FROM outbox_transactions_sync_wait_confirmation
   │
   v
9. INSERT INTO dtw_transaction_mapping (local_id, dtw_id, SYNCED)
   │→ UPDATE bulk SET confirmed_at=NOW()
   │→ Move file to trash/
```

### Inbound: Transaction Born in Digital Twin

```
1. Transaction created in Digital Twin (e.g., Pix, RTP, card purchase)
   │
   v
2. DTW sends transaction data to Core Adapter
   │  (arrives as a JSON file in digital-twin/transaction/from-dtw/)
   │
   v
3. DTW ingestion process (transaction_from_dtw.py):
   │  Reads file, each entry has a dtw_transaction_id but no local transaction_id:
   │
   v
4. INSERT INTO transactions (account_id, transaction_code, amount, ...)
   │  (full trigger chain fires)
   │→ Lifecycle validation passes (POSTED credit)
   │→ UPDATE accounts (balance change)
   │→ INSERT transaction_balances (running balance snapshot)
   │→ INSERT outbox_transactions (captured, but will be skipped in outbound sync)
   │
   v
5. INSERT INTO dtw_transaction_mapping (new local_id, dtw_id, SYNCED)
   │  UNIQUE on dtw_transaction_id prevents duplicate on retry
   │
   v
6. Transaction now exists in both systems.
   │  Balances are updated. Outbox captured the event.
   │  Next outbound sync will skip this event (mapping exists).
```

### File Flow

```
digital-twin/account/
  writing/    → sync writes here (milliseconds)
  written/    → sync moves here (atomic, file complete)
  confirm/    → DTW confirmations arrive here
  trash/      → processed files end up here

digital-twin/transaction/
  writing/    → sync writes here (milliseconds)
  written/    → sync moves here (atomic, file complete)
  confirm/    → DTW confirmations of outbound transactions arrive here
  from-dtw/   → DTW-born transactions arrive here (simulates Kafka consumer)
  trash/      → processed files end up here
```

---

## Monitoring

The sync wait tables are the primary monitoring surface:

| Query | Purpose |
|-------|---------|
| `SELECT COUNT(*) FROM outbox_transactions_sync_wait_confirmation` | How many events are in flight? Should be small. |
| `... JOIN bulk WHERE sent_at < NOW() - INTERVAL '5 min'` | What's stuck? Events sent but not confirmed. |
| `... JOIN bulk WHERE status = 'CREATED'` | What hasn't been sent yet? |
| `SELECT COUNT(*) FROM outbox_transactions WHERE event_id > (SELECT COALESCE(MAX(last_event_id), 0) FROM outbox_transactions_bulk)` | How many events haven't been bulked yet? |
| `SELECT COUNT(*) FROM dtw_transaction_mapping WHERE sync_status = 'PENDING'` | How many outbound transactions are awaiting DTW confirmation? |
| `SELECT COUNT(*) FROM dtw_transaction_mapping WHERE sync_status = 'SYNCED' AND created_at > NOW() - INTERVAL '1 hour'` | How many DTW-born transactions were ingested recently? |

In a healthy system:
- The sync wait tables have at most a few thousand rows (the last 1-2 unsent/unconfirmed bulks)
- Events move from outbox to bulk to confirmed within seconds
- The "stuck" query returns zero rows
- `dtw_transaction_mapping` grows monotonically with one row per transaction that has crossed the boundary in either direction
