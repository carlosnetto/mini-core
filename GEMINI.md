# GEMINI.md: AI Agent Guide for Mini-Core

## Project Context
Mini-Core is a database-first simulation of a core banking system. All business logic is implemented in PostgreSQL via triggers and functions. Schema management is handled strictly through Liquibase XML changesets. A Flask API server (`server/server.py`) connects a React web dashboard (`web/`) to the database — the frontend performs no validation, relying entirely on PostgreSQL for business rules.

## Core Mandates for AI Agents
- **Strict Liquibase Usage**: Never execute DDL directly against the database. All schema changes (tables, types, functions, triggers) MUST be authored as new XML changesets in `db/changelog/changes/`.
- **Atomic Changesets**: Each changeset should perform one logical operation (e.g., creating one table or one function).
- **Immutable Transactions**: The `transactions` table is insert-only. Do not implement logic that assumes updates or deletes on this table. Status transitions use modifier rows linked via `original_transaction_id`.
- **Outbox Integrity**: Every change to `accounts` or `transactions` must be captured by their respective outbox triggers.
- **Balance Logic**: Always account for both `available_balance` and `collected_balance`. Balance effects are data-driven via `transaction_code_balance_effects`. Both PENDING and POSTED born transactions apply the full effect.
- **No PENDING Credits**: Born CREDIT transactions cannot be PENDING — only POSTED is allowed. Enforced by `fn_validate_transaction_lifecycle`.
- **Frontend Does No Validation**: The React frontend intentionally sends raw requests. All business rules are enforced by PostgreSQL triggers. Error messages from the database are displayed directly in the UI.

## Development Workflows

### Adding/Modifying Schema
1. Create a new XML file in `db/changelog/changes/` following the naming convention (e.g., `008-new-feature.xml`).
2. Add the file to `db/changelog/db.changelog-master.xml`.
3. Use `run_shell_command` to execute `docker-compose up` or `liquibase update` to apply changes.

### Modifying PL/pgSQL Logic
1. Locate the relevant function/trigger in `004-create-functions-and-triggers.xml` (or a newer file like `007-no-pending-credits.xml`).
2. Create a new changeset with `replaceIfExists="true"` or `CREATE OR REPLACE FUNCTION`.
3. Ensure the trigger name remains consistent to avoid orphaned triggers.

### Modifying the API Server
1. Edit `server/server.py` — all endpoints are in a single file.
2. The server reads DB config from `.env` and sets `search_path` to `minicore`.
3. Use the `@handle_db_error` decorator on new endpoints to catch psycopg2 exceptions.

### Modifying the Frontend
1. Types in `web/types.ts` must match database column names exactly.
2. API calls go through `web/services/api.ts` — typed fetch wrappers.
3. Views are in `web/views/` — AccountsView, TransactionsView, OutboxView.
4. Dev mode: Vite proxies `/api` to `localhost:5001` (configured in `web/vite.config.ts`).

### Verification
- **Balance Checks**: After inserting transactions, verify that `transaction_balances` matches the current state in `accounts`.
- **Sync Wait**: Verify that `outbox_accounts_sync_wait_confirmation` and `outbox_transactions_sync_wait_confirmation` are populated correctly upon bulk creation.

## Command Reference
- **Start with seed data**: `LIQUIBASE_CONTEXTS=seed docker-compose up`
- **Start API server**: `cd server && python server.py`
- **Start frontend (dev)**: `cd web && npm run dev`
- **Build frontend (prod)**: `cd web && npm run build`
- **Start account sync**: `cd sync && python account_sync.py`
- **Start transaction sync**: `cd sync && python transaction_sync.py`
- **Start account confirm**: `cd sync && python account_confirm.py`
- **Start transaction confirm**: `cd sync && python transaction_confirm.py`
- **Start DTW-born ingestion**: `cd sync && python transaction_from_dtw.py`
- **Simulate DTW confirmation**: `cp digital-twin/account/written/bulk-N.json digital-twin/account/confirm/`
- **Simulate DTW-born transaction**: place a JSON file in `digital-twin/transaction/from-dtw/`
- **Re-download JDBC driver**: `curl -L -o drivers/postgresql.jar https://jdbc.postgresql.org/download/postgresql-42.7.5.jar`
- **Check Liquibase status**: `cd db && liquibase status`

## Common Pitfalls
- **Schema Name**: Always use the `minicore` schema prefix (e.g., `minicore.accounts`) in SQL. The Flask server sets `search_path` automatically.
- **Trigger Execution Order**: Remember the chain: `Transaction Insert -> Lifecycle Validation -> Balance Update -> Account Outbox -> Transaction Outbox`.
- **Numeric Precision**: Always use `NUMERIC(18,2)` for financial amounts.
- **Modifier Rows**: PENDING→POSTED or PENDING→CANCELLED transitions are new INSERT rows with `original_transaction_id` set, not UPDATEs.
- **UNIQUE on original_transaction_id**: Prevents double-confirm or double-cancel of a PENDING transaction.
