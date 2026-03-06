# Mini-Core: Simulated Existing Core Banking

A PostgreSQL simulation of an existing core banking system that synchronizes bidirectionally with [Matera](https://www.matera.com)'s Digital Twin using the Outbox Pattern. Includes a Flask API server and React web dashboard for browsing and managing accounts, transactions, and outbox events — all backed by real database triggers.

This is not a real core banking system. It's a teaching and demonstration tool where all business logic lives in the database as triggers and functions. The web dashboard intentionally performs no client-side validation — it sends raw requests and shows whatever PostgreSQL returns, demonstrating the database as the single source of truth.

## Prerequisites

- PostgreSQL 14+
- [Liquibase](https://www.liquibase.com/) CLI (or use the Docker setup)
- Python 3.8+ (for the API server)
- Node.js 18+ (for the web dashboard)
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

3. Apply the schema with Liquibase:

```bash
# Via Docker (includes SchemaSpy ER diagram generation):
LIQUIBASE_CONTEXTS=seed docker-compose up

# Or directly from the db/ directory:
cd db && liquibase update --contexts=seed
```

4. Start the web dashboard:

```bash
# Install and start the API server:
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python server.py                    # API on http://localhost:5001
python server.py --port 5010        # API on a custom port

# In another terminal, start the frontend:
cd web
npm install && npm run dev                        # Frontend on http://localhost:3000, proxies /api to :5001
API_PORT=5010 npm run dev -- --port 3010          # Custom ports for both frontend and API proxy
```

For production, build the frontend first and let the Flask server serve everything:

```bash
cd web && npm run build && cd ..
cd server && python server.py                     # Everything on http://localhost:5001
cd server && python server.py --port 5010         # Everything on http://localhost:5010
```

5. Start the sync and confirmation processes:

```bash
# Each process runs in its own terminal (reuse the server venv via symlink):
cd sync
python account_sync.py        # Listens for account outbox events → writes JSON
python transaction_sync.py    # Listens for transaction outbox events → writes JSON
python account_confirm.py     # Polls for confirmed account files → updates DB
python transaction_confirm.py # Polls for confirmed transaction files → updates DB
python transaction_from_dtw.py # Polls for DTW-born transaction files → creates locally
```

To simulate the Digital Twin confirming a bulk, copy the file from `written/` to `confirm/`:

```bash
cp digital-twin/account/written/bulk-1.json digital-twin/account/confirm/
```

To simulate the Digital Twin sending a new transaction, place a JSON file in `from-dtw/`:

```bash
# Example: create a file with a DTW-born credit transaction
cat > digital-twin/transaction/from-dtw/pix-001.json << 'EOF'
[
  {
    "dtw_transaction_id": "dtw-txn-pix-001",
    "account_id": 1000,
    "transaction_code": 10001,
    "amount": 500.00,
    "direction": "CREDIT",
    "status": "POSTED",
    "effective_date": "2026-02-16"
  }
]
EOF
```

## Web Dashboard

The React frontend provides a full UI for interacting with the database:

- **Accounts** — create, search, and browse accounts; click a status badge to change it (PostgreSQL validates the transition); click an account number to jump to its transactions
- **Transactions** — create transactions with a searchable picker for all 86 transaction codes; direction is auto-derived from balance effects; click a PENDING status to Post or Cancel it (inserts a modifier row); balance cards refresh after every change
- **Outbox** — separate views for account and transaction outbox events; displays mirrored columns and computed sync status (PENDING → WAITING → CONFIRMED); click any event ID to open a detail modal with full sync lifecycle, bulk info, DTW mapping, and confirmation data

## What's Inside

### Core Banking

- **Accounts** with two balances: available and collected
- **Transactions** (immutable, insert-only) with numeric codes from the 86-code catalog, data-driven balance updates via triggers, and a lifecycle model where PENDING transactions are confirmed or cancelled by inserting linked modifier rows
- **Transaction balances** — a running balance snapshot recorded after every transaction
- **86 US banking transaction codes** (deposits, withdrawals, fees) with configurable balance effects
- **Credit transactions cannot be PENDING** — only POSTED is allowed, enforced at the database level

### Outbox Pattern (CDC)

Every account change and every new transaction is automatically captured in outbox tables with mirrored columns (no JSONB). Account changes include PRE and POS snapshots so you can see exactly what changed.

### Digital Twin Sync

Bidirectional sync via the Core Adapter (see [CORE-ADAPTER.md](CORE-ADAPTER.md)):

**Outbound (Mini-Core → DTW):** accounts and transactions
```
Outbox event created (by trigger)
  → Sync process: bulk CREATED → SENDING → SENT, JSON written to written/
       → Sync wait rows auto-created (by trigger)
            → User copies file from written/ to confirm/ (simulates DTW)
                 → Confirm process: inserts confirmations, maps IDs, moves file to trash/
                      → Sync wait row auto-deleted (by trigger)
```

**Inbound (DTW → Mini-Core):** transactions only
```
DTW-born transaction arrives (JSON file in from-dtw/)
  → Ingestion process: creates transaction locally (full trigger chain fires)
       → Maps local ID ↔ DTW ID in dtw_transaction_mapping
```

**Pre-Authorization (double-spending prevention):**
```
Orchestrator calls DTW synchronously to create PENDING debit (reserves balance)
  → DTW declines: debit rejected, Mini-Core untouched
  → DTW accepts: dtw_pre_auth row created, then local transaction created
       → Sync process auto-confirms PENDING pre-auth events (already in DTW)
       → Sync process enriches POSTED pre-auth events with dtw_transaction_id
```

The `dtw_transaction_mapping` table is the single source of truth for "is this transaction in DTW?" — populated by both directions. The `dtw_pre_auth` table coordinates pre-authorized debits to prevent double-spending. Query `outbox_*_sync_wait_confirmation` tables to see what's stuck — they stay small by design.

## ER Diagram

ER diagrams and full interactive HTML documentation are auto-generated by [SchemaSpy](https://schemaspy.org/) on every `docker-compose up` into `docs/erd/`. Open `docs/erd/index.html` in your browser after running.

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
  ├── dtw_transaction_mapping               Local <-> DTW ID map (single source: "is it in DTW?")
  ├── dtw_pre_auth                          Pre-authorization reservations (double-spending prevention)
  ├── sync_cursors                          Sync process bookmarks
  │
  ├── currencies                            Reference: 10 supported currencies
  ├── balances                              Reference: AVAILABLE, COLLECTED
  ├── transaction_codes                     Reference: 86 US banking codes
  └── transaction_code_balance_effects      Config: which balances each code affects
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/accounts` | List accounts (optional `?search=` filter) |
| GET | `/api/accounts/<id>` | Get one account |
| POST | `/api/accounts` | Create account |
| PATCH | `/api/accounts/<id>` | Update account status |
| GET | `/api/accounts/<id>/transactions` | Transactions with running balances |
| POST | `/api/transactions` | Create transaction (triggers fire automatically) |
| GET | `/api/transaction-codes` | All 86 codes with balance effects |
| GET | `/api/outbox/accounts` | Account outbox events with sync_status |
| GET | `/api/outbox/accounts/<event_id>` | Enriched account event detail (bulk, confirmations) |
| GET | `/api/outbox/transactions` | Transaction outbox events with sync_status |
| GET | `/api/outbox/transactions/<event_id>` | Enriched transaction event detail (bulk, confirmations, DTW mapping) |

## Trigger Chains

**On transaction INSERT:**
```
INSERT transaction
  -> validate lifecycle rules (no PENDING credits, modifier must target PENDING, same account, etc.)
  -> update account balances (data-driven from transaction_code_balance_effects)
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
| 1000000001 | DDA | 17,950.00 | 17,950.00 | PENDING affects both balances |
| 1000000002 | SAV | 24,012.50 | 24,012.50 | |
| 1000000003 | MMA | 150,062.50 | 150,062.50 | Fee reversal is a POSTED credit |
| 1000000004 | HSA | 3,200.00 | 3,200.00 | Dormant, no transactions |
| 1000000005 | CD | 50,000.00 | 50,000.00 | No transactions |

## Project Structure

```
.env                        # DB connection (not committed)
listschemas.sh              # List all schemas in the database
listtables.sh               # List tables (default: minicore; pass schema name as arg)
transfer_data_pack.sh       # Pack .env + schema dump into a timestamped tarball
unpack.sh                   # Restore credentials and schema on target machine
server/
  server.py                 # Flask API + SPA static serving
  requirements.txt          # flask, psycopg2-binary, python-dotenv
sync/
  account_sync.py           # Sync: LISTEN/NOTIFY → bulk → JSON to digital-twin/account/written/
  account_confirm.py        # Confirm: polls digital-twin/account/confirm/ → DB confirmations → trash/
  transaction_sync.py       # Sync: LISTEN/NOTIFY → bulk → JSON to digital-twin/transaction/written/
  transaction_confirm.py    # Confirm: polls digital-twin/transaction/confirm/ → DB confirmations → trash/
  transaction_from_dtw.py   # Inbound: polls digital-twin/transaction/from-dtw/ → creates transactions → maps IDs
digital-twin/               # JSON files simulating Digital Twin sends (gitignored)
  account/
    writing/                # Temp: file being written (milliseconds)
    written/                # Complete: file ready (manually copy to confirm/ to simulate DTW)
    confirm/                # User copies here → confirm process picks up and updates DB
    trash/                  # Done: confirmation inserted into PostgreSQL
  transaction/              # Same four stages + from-dtw/ for inbound DTW-born transactions
    from-dtw/               # Place JSON here to simulate DTW sending new transactions
web/
  services/api.ts           # Typed API client
  types.ts                  # TypeScript interfaces matching DB columns
  views/                    # AccountsView, TransactionsView, OutboxView
  components/               # Layout, Logo, Badge, etc.
  vite.config.ts            # Dev proxy: /api → localhost:5001
docs/
  erd/                      # Auto-generated ER diagrams and HTML docs (SchemaSpy)
db/
  liquibase.properties      # Reads from .env
  changelog/
    db.changelog-master.xml
    changes/
      001-create-types.xml                  # 7 enums
      002-create-tables.xml                 # 25 changesets: tables, sequences & FKs
      003-create-indexes.xml                # 13 indexes
      004-create-functions-and-triggers.xml # 20 functions & triggers
      005-seed-data.xml                     # Reference + test data
      006-remove-processed-column.xml       # Drops processed column from outbox tables
      007-no-pending-credits.xml            # Prevents PENDING credit transactions
      008-notify-outbox.xml                 # LISTEN/NOTIFY trigger on outbox_accounts
      009-skip-balance-outbox.xml           # Skips outbox rows for balance-only updates
      010-notify-outbox-transactions.xml    # LISTEN/NOTIFY trigger on outbox_transactions
      011-create-dtw-pre-auth.xml           # Pre-authorization table for double-spending prevention
```

**81 changesets across 11 files.**

## License

See [LICENSE](LICENSE).
