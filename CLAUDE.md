# Mini-Core: Simulated Existing Core Banking System

## What This Project Is

A PostgreSQL schema simulating an "Existing Core Banking" system that synchronizes bidirectionally with Matera's Digital Twin (DTW). It uses the **Outbox Pattern** for Change Data Capture (CDC) and **database triggers** for automated balance calculations. All objects live in the `minicore` PostgreSQL schema (already created externally).

This is not a real core banking system. It's a teaching/demo tool designed to be easy to understand and explain.

## Tech Stack

- **PostgreSQL** (all logic lives in the database)
- **Liquibase** for schema management (XML changesets)
- No application code yet — everything is triggers and tables

## Project Structure

```
.env                          # DB connection variables (DB_HOST, DB_PORT, DB_NAME, DB_SCHEMA, DB_USERNAME, DB_PASSWORD)
db/
  liquibase.properties        # References .env vars via ${...} interpolation
  changelog/
    db.changelog-master.xml   # Includes the 5 change files in order
    changes/
      001-create-types.xml            #  7 changesets — enums
      002-create-tables.xml           # 18 changesets — sequences, all tables
      003-create-indexes.xml          # 11 changesets — all indexes
      004-create-functions-and-triggers.xml  # 16 changesets — all PL/pgSQL functions + triggers
      005-seed-data.xml               #  5 changesets — reference data (always) + test data (context=seed)
```

**Total: 57 changesets across 5 files.**

## Running

```bash
# Schema + reference data only:
docker-compose up

# Schema + reference data + test data (5 accounts, 10 transactions):
LIQUIBASE_CONTEXTS=seed docker-compose up
```

Liquibase runs, applies all changesets, and exits automatically.

### PostgreSQL JDBC Driver

The Liquibase 5.x Docker image (`liquibase/liquibase`) does **not** bundle the PostgreSQL JDBC driver — it only ships with H2. The driver is downloaded separately into the `drivers/` directory and mounted into the container at `/liquibase/lib`. If the driver file is missing or the container fails with `Cannot find database driver: org.postgresql.Driver`, re-download it:

```bash
curl -L -o drivers/postgresql.jar https://jdbc.postgresql.org/download/postgresql-42.7.5.jar
```

## Database Objects

### Enums (7)

| Enum | Values |
|------|--------|
| `product_type_enum` | DDA, SAV, MMA, HSA, CD |
| `account_status_enum` | ACTIVE, DORMANT, FROZEN, CLOSED |
| `transaction_direction_enum` | DEBIT, CREDIT |
| `transaction_status_enum` | PENDING, POSTED, REVERSED |
| `operation_type_enum` | INSERT, UPDATE |
| `sync_status_enum` | PENDING, SYNCED, FAILED, RECONCILED |
| `bulk_status_enum` | CREATED, SENDING, SENT |

### Tables (16)

**Core tables:**
- `accounts` — PK from sequence starting at 1000. Two balances: `available_balance` and `collected_balance`. No ledger balance.
- `transactions` — PK from sequence starting at 100000. Immutable (insert-only, never updated). Has CHECK constraint limiting `transaction_code` to: DEP, WDL, TFR, FEE, INT, ADJ, PMT, REV, CHK, ACH, WIR. Amount must be > 0.
- `transaction_balances` — Running balance snapshot. One row per transaction, recording both account balances AFTER that transaction was applied. PK = transaction_id.

**Outbox tables (CDC via Outbox Pattern):**
- `outbox_accounts` — Mirrors all account columns (not JSONB). Has `snapshot_type` column: `PRE` (before change) and `POS` (after change). INSERTs get one POS row; UPDATEs get a PRE + POS pair.
- `outbox_transactions` — Mirrors all transaction columns (not JSONB). Insert-only (transactions are never updated).

**Outbox bulk control (batching sends to Digital Twin):**
- `outbox_accounts_bulk` — Groups outbox_accounts events into bulk sends. Tracks `first_event_id`/`last_event_id` range. Status: CREATED -> SENDING -> SENT.
- `outbox_transactions_bulk` — Same pattern for transaction outbox events.

**Outbox sync wait (what's still pending confirmation):**
- `outbox_accounts_sync_wait_confirmation` — One row per account outbox event waiting for DTW confirmation. Auto-populated by trigger when a bulk is created. Auto-deleted by trigger when confirmation arrives. **Designed to stay small** — query this table to find stuck events.
- `outbox_transactions_sync_wait_confirmation` — Same pattern for transactions.

**Outbox confirmations (DTW acknowledgments):**
- `outbox_accounts_confirmations` — One row per confirmed account event. PK = event_id (from outbox_accounts). Existence of row = DTW confirmed that change.
- `outbox_transactions_confirmations` — Same for transactions.

**Sync infrastructure:**
- `dtw_transaction_mapping` — Maps local transaction_id to DTW transaction_id.
- `sync_cursors` — Tracks sync process progress.

**Reference/configuration tables:**
- `balances` — Two rows: AVAILABLE, COLLECTED. FK target for balance effects.
- `transaction_codes` — 86 US banking transaction codes with numeric PK (NUMERIC(5)) and user-facing description. Organized in ranges: 10001-10099 credits, 20001-20099 debits, 30001-30099 fees.
- `transaction_code_balance_effects` — Maps each transaction code to which balances it affects and the sign (+1 or -1). Composite PK (transaction_code, balance_name). A trigger prevents opposite signs for the same code (e.g., can't have +1 on AVAILABLE and -1 on COLLECTED).

### Functions & Triggers (8 pairs)

**Balance update chain (fires on transaction INSERT):**
1. `fn_update_account_balance` / `trg_update_account_balance` — AFTER INSERT on transactions. Computes signed amount from direction (CREDIT=+, DEBIT=-) and status (REVERSED flips sign). PENDING updates only collected_balance; POSTED/REVERSED updates both. Uses `UPDATE ... RETURNING` to capture new balances, then inserts a snapshot into `transaction_balances`.

**Outbox triggers:**
2. `fn_outbox_accounts` / `trg_outbox_accounts` — AFTER INSERT OR UPDATE on accounts. Writes PRE/POS snapshots with mirrored columns.
3. `fn_outbox_transactions` / `trg_outbox_transactions` — AFTER INSERT on transactions. Writes mirrored columns (hardcodes operation_type='INSERT').

**Bulk sync auto-populate:**
4. `fn_populate_accounts_sync_wait_confirmation` / `trg_populate_accounts_sync_wait_confirmation` — AFTER INSERT on outbox_accounts_bulk. Selects all outbox events in the bulk's range and inserts them into the sync wait table.
5. `fn_populate_transactions_sync_wait_confirmation` / `trg_populate_transactions_sync_wait_confirmation` — Same for transactions bulk.

**Confirmation auto-cleanup:**
6. `fn_cleanup_accounts_sync_wait_confirmation` / `trg_cleanup_accounts_sync_wait_confirmation` — AFTER INSERT on outbox_accounts_confirmations. Deletes the matching row from the sync wait table.
7. `fn_cleanup_transactions_sync_wait_confirmation` / `trg_cleanup_transactions_sync_wait_confirmation` — Same for transactions.

**Data integrity:**
8. `fn_check_effect_consistency` / `trg_check_effect_consistency` — BEFORE INSERT OR UPDATE on transaction_code_balance_effects. Prevents a transaction code from having opposite signs for different balances.

### Trigger Chain on Transaction INSERT

When a transaction is inserted, this cascade fires:
```
INSERT INTO transactions
  -> trg_update_account_balance
       UPDATE accounts (balances)
         -> trg_outbox_accounts (PRE + POS rows)
       INSERT INTO transaction_balances (snapshot)
  -> trg_outbox_transactions (mirrored row)
```

### Trigger Chain on Bulk Creation

```
INSERT INTO outbox_transactions_bulk
  -> trg_populate_transactions_sync_wait_confirmation
       INSERT one row per event into outbox_transactions_sync_wait_confirmation
```

### Trigger Chain on Confirmation

```
INSERT INTO outbox_transactions_confirmations
  -> trg_cleanup_transactions_sync_wait_confirmation
       DELETE matching row from outbox_transactions_sync_wait_confirmation
```

## Seed Data (context=seed)

**5 accounts:** DDA ($5K), SAV ($25K), MMA ($150K), HSA ($3.2K dormant), CD ($50K)

**10 transactions** that exercise the trigger chain. Expected post-seed balances:

| Account | Available | Collected | Note |
|---------|-----------|-----------|------|
| DDA 1000000001 | 7,950.00 | 17,950.00 | Collected includes $10K pending check |
| SAV 1000000002 | 24,012.50 | 24,012.50 | |
| MMA 1000000003 | 150,062.50 | 150,062.50 | Fee reversed by courtesy adjustment |
| HSA 1000000004 | 3,200.00 | 3,200.00 | No transactions |
| CD 1000000005 | 50,000.00 | 50,000.00 | No transactions |

**2 sync cursors:** dtw-account-sync, dtw-transaction-sync (both at 0)

Reference data (transaction codes + balance effects) runs without context — always applied.

## Key Design Decisions

- **Outbox tables mirror columns** instead of storing JSONB payloads. Makes it easier to query and explain.
- **Transactions are immutable** — insert-only, never updated. The outbox trigger only fires on INSERT.
- **Accounts have two balances**: `available_balance` and `collected_balance`. No ledger balance.
- **PENDING transactions** update only `collected_balance`. POSTED/REVERSED update both.
- **Sync wait tables stay small by design** — rows are auto-created on bulk creation and auto-deleted on confirmation. Query them to find what's stuck.
- **Transaction codes use numeric ranges**: 10001-10099 credits, 20001-20099 debits, 30001-30099 fees. Each code has a user-facing description and balance effects (+1/-1) configured in `transaction_code_balance_effects`.
- **No opposite signs** allowed for the same transaction code across different balances (enforced by trigger).
- **Schema `minicore` is created externally** — Liquibase does not create it.
