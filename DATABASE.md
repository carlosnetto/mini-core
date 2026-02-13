# Data Model

All tables live in the `minicore` PostgreSQL schema. This document describes the data model organized by functional groups. For the synchronization strategy and rationale, see [SYNC.md](SYNC.md).

## Enums

Seven PostgreSQL enums define the domain vocabulary:

| Enum | Values |
|------|--------|
| `product_type_enum` | DDA, SAV, MMA, HSA, CD |
| `account_status_enum` | ACTIVE, DORMANT, FROZEN, CLOSED |
| `transaction_direction_enum` | DEBIT, CREDIT |
| `transaction_status_enum` | PENDING, POSTED, REVERSED |
| `operation_type_enum` | INSERT, UPDATE |
| `sync_status_enum` | PENDING, SYNCED, FAILED, RECONCILED |
| `bulk_status_enum` | CREATED, SENDING, SENT |

---

## Group 1: Core Banking

These tables represent the core banking system — accounts, their transactions, and running balance history.

### accounts

The central entity. Each account has two balances that change automatically via triggers when transactions are inserted.

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | BIGINT PK | Auto-generated from sequence (starts at 1000) |
| `account_number` | VARCHAR(20) | UNIQUE, external-facing identifier |
| `product_type` | product_type_enum | DDA, SAV, MMA, HSA, CD |
| `status` | account_status_enum | Default: ACTIVE |
| `available_balance` | NUMERIC(18,2) | Funds available for immediate use |
| `collected_balance` | NUMERIC(18,2) | Includes pending items not yet available |
| `currency_code` | VARCHAR(3) | Default: USD |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Updated by the balance trigger |

**Balance semantics:** A PENDING transaction (e.g., a check deposit) updates only `collected_balance`. A POSTED transaction updates both. A REVERSED transaction flips the sign and updates both. The difference between `collected_balance` and `available_balance` represents funds in float.

### transactions

Immutable, insert-only ledger. Every row represents a financial event. Inserting a transaction fires a trigger chain that updates account balances, writes a balance snapshot, and populates the outbox.

| Column | Type | Notes |
|--------|------|-------|
| `transaction_id` | BIGINT PK | Auto-generated from sequence (starts at 100000) |
| `account_id` | BIGINT FK | References `accounts` |
| `transaction_code` | VARCHAR(10) | CHECK constraint: DEP, WDL, TFR, FEE, INT, ADJ, PMT, REV, CHK, ACH, WIR |
| `amount` | NUMERIC(18,2) | Always positive (CHECK > 0). Direction is separate. |
| `direction` | transaction_direction_enum | DEBIT or CREDIT |
| `status` | transaction_status_enum | PENDING, POSTED, or REVERSED |
| `json_payload` | JSONB | Arbitrary metadata (descriptions, check numbers, terminal IDs) |
| `effective_date` | DATE | Business date of the transaction |
| `created_at` | TIMESTAMPTZ | |

**Indexes:** `account_id`, `(account_id, effective_date DESC)` for statement queries, `status`, GIN on `json_payload` with `jsonb_path_ops`.

### transaction_balances

A running balance snapshot created automatically by the balance update trigger. One row per transaction, recording both balances immediately after that transaction was applied.

| Column | Type | Notes |
|--------|------|-------|
| `transaction_id` | BIGINT PK | FK to `transactions` (1:1 relationship) |
| `account_id` | BIGINT FK | References `accounts` |
| `available_balance` | NUMERIC(18,2) | Account's available balance after this transaction |
| `collected_balance` | NUMERIC(18,2) | Account's collected balance after this transaction |
| `created_at` | TIMESTAMPTZ | |

---

## Group 2: Reference & Configuration

These tables define the full catalog of transaction codes and how each one affects account balances.

### transaction_codes

86 US banking transaction codes organized by numeric range:

| Range | Category | Count | Examples |
|-------|----------|-------|----------|
| 10001 - 10031 | Credits / Deposits | 31 | Cash deposit, direct deposit, ACH credit, Zelle received, RTP received, FedNow received |
| 20001 - 20035 | Debits / Withdrawals | 35 | Debit card purchase, ATM withdrawal, check paid, wire sent, Zelle sent, bill payment |
| 30001 - 30020 | Fees | 20 | Monthly maintenance, overdraft, NSF, ATM fee, wire fee, dormant account fee |

| Column | Type | Notes |
|--------|------|-------|
| `transaction_code` | NUMERIC(5) PK | Numeric code |
| `description` | VARCHAR(100) | Human-readable label |

### balances

Simple reference table listing the two balance types.

| Column | Type | Notes |
|--------|------|-------|
| `balance_name` | VARCHAR(20) PK | AVAILABLE or COLLECTED |

### transaction_code_balance_effects

Defines which balances each transaction code affects and in which direction. The `effect` column is a multiplier (+1 or -1) applied to the transaction amount.

| Column | Type | Notes |
|--------|------|-------|
| `transaction_code` | NUMERIC(5) | PK (composite), FK to `transaction_codes` |
| `balance_name` | VARCHAR(20) | PK (composite), FK to `balances` |
| `effect` | SMALLINT | +1 or -1 (CHECK constraint) |

A trigger (`fn_check_effect_consistency`) prevents a single transaction code from having opposite signs for different balances — if a code is +1 for AVAILABLE, it must also be +1 for COLLECTED.

In the seed data, all 86 codes have effects on both balances: credits are +1/+1, debits and fees are -1/-1.

---

## Group 3: Outbox (Change Data Capture)

These tables capture every change made to accounts and transactions within the same database transaction that made the change. No JSONB blobs — every column from the source table is mirrored directly.

### outbox_accounts

Populated automatically by a trigger on `accounts`. On INSERT, writes one POS row. On UPDATE, writes two rows: PRE (state before) and POS (state after).

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | BIGSERIAL PK | Monotonically increasing, used for bulk ranges |
| `operation_type` | operation_type_enum | INSERT or UPDATE |
| `snapshot_type` | VARCHAR(3) | PRE or POS (CHECK constraint) |
| `account_id` | BIGINT | Mirrored from `accounts` |
| `account_number` | VARCHAR(20) | Mirrored |
| `product_type` | product_type_enum | Mirrored |
| `status` | account_status_enum | Mirrored |
| `available_balance` | NUMERIC(18,2) | Mirrored |
| `collected_balance` | NUMERIC(18,2) | Mirrored |
| `currency_code` | VARCHAR(3) | Mirrored |
| `account_created_at` | TIMESTAMPTZ | Mirrored (renamed to avoid collision with outbox `created_at`) |
| `account_updated_at` | TIMESTAMPTZ | Mirrored |
| `created_at` | TIMESTAMPTZ | When the outbox event was created |

### outbox_transactions

Populated automatically by a trigger on `transactions` (AFTER INSERT only — transactions are immutable).

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | BIGSERIAL PK | Monotonically increasing |
| `operation_type` | operation_type_enum | Always INSERT |
| `transaction_id` | BIGINT | Mirrored from `transactions` |
| `account_id` | BIGINT | Mirrored |
| `transaction_code` | VARCHAR(10) | Mirrored |
| `amount` | NUMERIC(18,2) | Mirrored |
| `direction` | transaction_direction_enum | Mirrored |
| `status` | transaction_status_enum | Mirrored |
| `json_payload` | JSONB | Mirrored |
| `effective_date` | DATE | Mirrored |
| `transaction_created_at` | TIMESTAMPTZ | Mirrored (renamed) |
| `created_at` | TIMESTAMPTZ | When the outbox event was created |

Events not yet included in a bulk are identified by having `event_id` greater than the `last_event_id` of the most recent bulk — no status column needed.

---

## Group 4: Sync Control

These tables manage the lifecycle of sending outbox events to Digital Twin and tracking confirmations. For the full sync strategy (bulking, wire format, small-table design), see [SYNC.md](SYNC.md).

### outbox_accounts_bulk / outbox_transactions_bulk

Each row represents a batch of outbox events grouped by a contiguous range of `event_id` values.

| Column | Type | Notes |
|--------|------|-------|
| `bulk_id` | BIGSERIAL PK | |
| `first_event_id` | BIGINT FK | References the outbox table's `event_id` |
| `last_event_id` | BIGINT FK | References the outbox table's `event_id` |
| `status` | bulk_status_enum | CREATED -> SENDING -> SENT |
| `sent_at` | TIMESTAMPTZ | Set when status moves to SENT |
| `confirmed_at` | TIMESTAMPTZ | Set when all events in the range are confirmed |
| `created_at` | TIMESTAMPTZ | |

**Constraint:** `last_event_id >= first_event_id`.

**Trigger:** Inserting a bulk row automatically populates the corresponding `sync_wait_confirmation` table with one row per event in the range.

### outbox_accounts_sync_wait_confirmation / outbox_transactions_sync_wait_confirmation

The "small table" — contains only events that have been sent but not yet confirmed. Designed to stay small (a few thousand rows at most) even in systems processing millions of events per day.

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | BIGINT PK | FK to the outbox table |
| `bulk_id` | BIGINT FK | FK to the bulk table (indexed) |
| `created_at` | TIMESTAMPTZ | |

**Auto-populated** by a trigger on the bulk table (one row per event in `[first_event_id, last_event_id]`).

**Auto-deleted** by a trigger on the confirmations table when a confirmation arrives for that `event_id`.

### outbox_accounts_confirmations / outbox_transactions_confirmations

Each row proves that Digital Twin confirmed processing of a specific outbox event.

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | BIGINT PK | FK to the outbox table (1:1 relationship) |
| `dtw_confirmation` | VARCHAR(255) | Reference ID from Digital Twin's system |
| `created_at` | TIMESTAMPTZ | |

**Trigger:** Inserting a confirmation automatically deletes the corresponding row from the `sync_wait_confirmation` table.

### dtw_transaction_mapping

Maps local transaction IDs to Digital Twin transaction IDs for cross-system reference.

| Column | Type | Notes |
|--------|------|-------|
| `local_transaction_id` | BIGINT PK | FK to `transactions` |
| `dtw_transaction_id` | VARCHAR(64) | UNIQUE. Digital Twin's identifier. |
| `sync_status` | sync_status_enum | PENDING, SYNCED, FAILED, RECONCILED |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### sync_cursors

Bookmarks used by the sync process to track progress.

| Column | Type | Notes |
|--------|------|-------|
| `cursor_name` | VARCHAR(100) PK | e.g., `dtw-account-sync`, `dtw-transaction-sync` |
| `last_processed_event_id` | BIGINT | Default: 0 |
| `updated_at` | TIMESTAMPTZ | |

---

## Entity Relationships

```
accounts ──────────────── 1:N ──── transactions
    |                                    |
    |                                    └──── 1:1 ──── transaction_balances
    |
    ├── (trigger) ──── outbox_accounts ────── 1:1 ──── outbox_accounts_confirmations
    |                       |
    |                       └── (bulk range) ── outbox_accounts_bulk
    |                                               |
    |                                               └── (trigger) ── outbox_accounts_sync_wait_confirmation
    |
    └──────────────────── (trigger) ──── outbox_transactions ──── 1:1 ──── outbox_transactions_confirmations
                                              |
                                              └── (bulk range) ── outbox_transactions_bulk
                                                                      |
                                                                      └── (trigger) ── outbox_transactions_sync_wait_confirmation

transactions ──── 1:1 ──── dtw_transaction_mapping

transaction_codes ──── N:M (via effects) ──── balances
```

## Trigger Chain Summary

Inserting a transaction fires this cascade:

1. `fn_update_account_balance` — updates `accounts` balances, inserts into `transaction_balances`
2. `fn_outbox_accounts` — writes PRE + POS snapshots to `outbox_accounts` (fired by the account UPDATE in step 1)
3. `fn_outbox_transactions` — writes the transaction to `outbox_transactions`

Later, the sync process creates bulks, which fire:

4. `fn_populate_*_sync_wait_confirmation` — one row per event in the bulk range

And when confirmations arrive:

5. `fn_cleanup_*_sync_wait_confirmation` — deletes the corresponding sync wait row
