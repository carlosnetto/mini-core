# Mini-Core: Simulated Existing Core Banking

A PostgreSQL-only simulation of an existing core banking system that synchronizes bidirectionally with [Matera](https://www.matera.com)'s Digital Twin using the Outbox Pattern.

This is not a real core banking system. It's a teaching and demonstration tool where all logic lives in the database as triggers and tables — no application code required.

## Prerequisites

- PostgreSQL 14+
- [Liquibase](https://www.liquibase.com/) CLI
- A PostgreSQL database with a schema named `minicore` already created

## Quick Start

1. Clone the repository and configure your connection:

```bash
cp .env.example .env   # edit with your credentials
```

2. Create the schema in your database:

```sql
CREATE SCHEMA IF NOT EXISTS minicore;
```

3. Run Liquibase from the `db/` directory:

```bash
cd db

# Schema + reference data only (86 transaction codes, balance effects):
liquibase update

# Schema + reference data + test data (5 accounts, 10 transactions):
liquibase update --contexts=seed
```

## What's Inside

### Core Banking

- **Accounts** with two balances: available and collected
- **Transactions** (immutable, insert-only) that automatically update account balances via triggers
- **Transaction balances** — a running balance snapshot recorded after every transaction
- **86 US banking transaction codes** (deposits, withdrawals, fees) with configurable balance effects

### Outbox Pattern (CDC)

Every account change and every new transaction is automatically captured in outbox tables with mirrored columns (no JSONB). Account changes include PRE and POS snapshots so you can see exactly what changed.

### Digital Twin Sync

A complete sync lifecycle managed entirely in the database:

```
Outbox event created (by trigger)
  -> Grouped into a bulk
       -> Sync wait rows auto-created (by trigger)
            -> Sent to Digital Twin
                 -> Confirmation received
                      -> Sync wait row auto-deleted (by trigger)
```

Query `outbox_*_sync_wait_confirmation` tables to see what's stuck — they stay small by design.

## Schema Overview

```
minicore
  ├── accounts                              Core account data, two balances
  ├── transactions                          Immutable transaction log
  ├── transaction_balances                  Running balance after each transaction
  │
  ├── outbox_accounts                       CDC: mirrored account snapshots (PRE/POS)
  ├── outbox_transactions                   CDC: mirrored transaction rows
  │
  ├── outbox_accounts_bulk                  Batch sends to Digital Twin
  ├── outbox_transactions_bulk
  │
  ├── outbox_accounts_sync_wait_confirmation      Pending DTW confirmations
  ├── outbox_transactions_sync_wait_confirmation
  │
  ├── outbox_accounts_confirmations         DTW acknowledgments
  ├── outbox_transactions_confirmations
  │
  ├── dtw_transaction_mapping               Local <-> DTW transaction ID map
  ├── sync_cursors                          Sync process bookmarks
  │
  ├── balances                              Reference: AVAILABLE, COLLECTED
  ├── transaction_codes                     Reference: 86 US banking codes
  └── transaction_code_balance_effects      Config: which balances each code affects
```

## Trigger Chains

**On transaction INSERT:**
```
INSERT transaction
  -> update account balances (available/collected)
       -> write PRE + POS to outbox_accounts
  -> write balance snapshot to transaction_balances
  -> write to outbox_transactions
```

**On bulk creation:**
```
INSERT bulk -> auto-populate sync_wait_confirmation (one row per event)
```

**On confirmation:**
```
INSERT confirmation -> auto-delete from sync_wait_confirmation
```

## Seed Data

When running with `--contexts=seed`, creates 5 accounts and 10 transactions:

| Account | Type | Available | Collected | Note |
|---------|------|-----------|-----------|------|
| 1000000001 | DDA | 7,950.00 | 17,950.00 | Includes $10K pending check |
| 1000000002 | SAV | 24,012.50 | 24,012.50 | |
| 1000000003 | MMA | 150,062.50 | 150,062.50 | Fee reversed |
| 1000000004 | HSA | 3,200.00 | 3,200.00 | Dormant, no transactions |
| 1000000005 | CD | 50,000.00 | 50,000.00 | No transactions |

## Project Structure

```
.env                        # DB connection (not committed)
db/
  liquibase.properties      # Reads from .env
  changelog/
    db.changelog-master.xml
    changes/
      001-create-types.xml                  # 7 enums
      002-create-tables.xml                 # 18 tables & sequences
      003-create-indexes.xml                # 11 indexes
      004-create-functions-and-triggers.xml # 16 functions & triggers
      005-seed-data.xml                     # Reference + test data
      006-remove-processed-column.xml       # Drops processed column from outbox tables
```

## License

See [LICENSE](LICENSE).
