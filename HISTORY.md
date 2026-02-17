# History

## February 12, 2026

Project inception.

- **Initial commit**: LICENSE file (Apache 2.0).
- **README**: Initial project README.

## February 13, 2026

### Schema & Infrastructure

- **Complete Liquibase schema**: 59 changesets across 5 files — 7 enums, 16 tables, 13 indexes, 8 trigger/function pairs, and 86 US banking transaction codes. Includes Outbox Pattern for CDC, bulk sync control, and auto-managed sync wait confirmation tables. Docker Compose setup for running Liquibase automatically.
- **Documentation**: CLAUDE.md (AI agent guidelines), DATABASE.md (full data model reference), SYNC.md (sync architecture), and comprehensive README.
- **Remove processed column**: Dropped `processed` boolean and its partial indexes from outbox tables. Bulking uses `event_id > last bulk's last_event_id` instead.
- **TODO list**: Architecture improvement items identified with Gemini 2.0 Flash (GEMINI.md + TODO.md).

### Architecture Improvements

The following items were originally tracked in TODO.md and addressed during this session.

### High Priority: Core Logic & Consistency

- **Data-Driven Balance Logic**: Refactored `fn_update_account_balance` to query `transaction_code_balance_effects` instead of using hardcoded `IF/ELSE` logic for direction and status.

- **Reconcile Transaction Codes**: Unified the transaction code systems. The `transactions` table now uses the same type (NUMERIC) as `transaction_codes` and references it via a Foreign Key instead of a hardcoded `CHECK` constraint.

- **Fix Lifecycle Status Updates**: Resolved via linked modifier rows. PENDING transactions are confirmed or cancelled by inserting a new row with `original_transaction_id` pointing to the original. No UPDATEs needed. A `trg_prevent_transaction_update` trigger enforces immutability at the database level.

### Medium Priority: Performance & Scalability

- **Optimize Sync Wait Fan-out**: Not needed. Confirmations arrive per-event (not per-bulk), since a transaction sent in one bulk can be confirmed in another bulk or individually. The 1:1 sync_wait rows are the correct granularity — bulk is only a transmission accelerator, not a confirmation unit.

- **Outbox Naming Convention**: Mirrored columns now use identical names as their source tables. The outbox's own timestamp was renamed from `created_at` to `event_created_at` to avoid collision.

### Low Priority: Data Integrity & Extension

- **Currency Validation**: Added `currencies` reference table (USD, BRL, USDC, USDT, POL, ETH, BRL1, BRLD, BRLV, BRLN) with FK from `accounts.currency_code`. Transactions inherit currency from their account via `account_id` FK, so no mismatch is possible.

- **Schema-level Constraints**: Keeping `json_payload` as JSONB is the right call. The metadata per transaction is impossible to know in advance — RTP, FedNow, Pix, blockchain txHash, check numbers, terminal IDs — each payment rail carries fundamentally different information. Dedicated columns would require schema changes for every new rail. **Production note:** If row width becomes a concern, a separate `transaction_payloads` table (same PK as `transactions`, containing only the JSONB) could reduce I/O for queries that don't need the payload. However, PostgreSQL already optimizes this via TOAST: JSONB values exceeding ~2KB are automatically stored out-of-line in a separate TOAST table, so queries that don't SELECT `json_payload` don't pay the I/O cost. A manual split would only add JOIN complexity without meaningful benefit unless the payload is consistently small enough to stay inline and scans are frequent. For this system, TOAST is sufficient.

- **Audit Trail**: Added optional `created_by` VARCHAR(20) to `accounts`, `transactions`, and their outbox mirrors. No validation — free-form text for the caller to identify itself.

- **Outbox Foreign Keys**: Added FKs from outbox tables to their source tables: `outbox_accounts.account_id` → `accounts`, `outbox_transactions.account_id` → `accounts`, `outbox_transactions.transaction_code` → `transaction_codes`. In production outbox tables often omit these for decoupling, but this is an educational system where referential integrity aids understanding.

### Web Dashboard & API Server

- **Flask API server** (`server/server.py`): Single-file Python server exposing 9 REST endpoints backed by PostgreSQL. Reads DB config from `.env` (same vars Liquibase uses). Custom error handler translates psycopg2 exceptions (trigger RAISE, unique violations, FK violations, check violations) into meaningful HTTP error responses. Serves the built React frontend as static files with SPA catch-all.

- **React frontend** (`web/`): Full web dashboard built with Vite + TypeScript + Tailwind CSS. Three main views:
  - **Accounts**: Create, search, browse. Clickable status badges with dropdown to change status — no client-side validation, PostgreSQL trigger errors displayed in modal. Clickable account numbers navigate to the transactions view.
  - **Transactions**: Lazy-loads per account. New Transaction modal with searchable picker for all 86 transaction codes. Direction auto-derived from `transaction_code_balance_effects`. PENDING transactions have clickable status badges to Post (confirm) or Cancel via modifier rows. Balance cards refresh after changes.
  - **Outbox**: Separate tabs for account and transaction events. Displays mirrored columns with computed sync_status (PENDING/WAITING/CONFIRMED).

- **No PENDING credits** (changeset 007): Updated `fn_validate_transaction_lifecycle` to reject born CREDIT transactions with PENDING status. Only POSTED is allowed for credits. Enforced at the database level — the frontend intentionally allows the attempt so users can see the database error.

## February 14, 2026

### Sync & Confirmation Processes

- **Four-stage file flow**: Replaced flat `digitaltwin-account/` and `digitaltwin-transaction/` directories with a structured `digital-twin/` directory. Each entity (account, transaction) has four subdirectories: `writing/` (temp, milliseconds), `written/` (atomic move, file complete), `confirm/` (user manually copies here to simulate DTW), `trash/` (after DB confirmation).

- **Sync processes** (`account_sync.py`, `transaction_sync.py`): Updated to write JSON to `writing/`, then atomically move to `written/`. Account sync now includes `pre_event_id` in UPDATE entries so both PRE and POS outbox events can be confirmed.

- **Confirmation processes** (`account_confirm.py`, `transaction_confirm.py`): New Python programs that poll `confirm/` every 10 seconds. When a JSON file appears, they insert a confirmation row per event into `outbox_<entity>_confirmations` (triggering auto-deletion from `sync_wait_confirmation`), update the bulk's `confirmed_at`, and move the file to `trash/`. Account confirm handles both POS and PRE event_ids.

- **Shared venv**: Symlinked `sync/.venv` → `server/.venv` so both directories share the same Python environment.

### Outbox Event Detail Modal

- **Two new API endpoints**: `GET /api/outbox/transactions/<event_id>` and `GET /api/outbox/accounts/<event_id>` — each returns an enriched view of a single outbox event by JOINing the event with its bulk, sync wait, confirmations, and (for transactions) transaction codes and DTW mapping tables.

- **Clickable event IDs**: In the Outbox views (both accounts and transactions tabs), the `event_id` column is now a clickable link that opens a read-only detail modal.

- **Detail modal sections**: The modal displays the full event lifecycle organized in sections — entity details (transaction code description, amounts, status), sync timeline (visual step-by-step from creation through confirmation), bulk information (ID, status, timestamps), Digital Twin mapping (DTW transaction ID and sync status, transactions only), confirmation data (DTW confirmation string), and JSON payload (pretty-printed, if present). Sections only render when data is available (e.g., no bulk section for PENDING events).

## February 16, 2026

### Core Adapter & Bidirectional Transaction Sync

- **SYNC.md renamed to CORE-ADAPTER.md**: Reframed the sync documentation around the Core Adapter concept — the set of tables, processes, and conventions exclusively dedicated to synchronization between Mini-Core and the Digital Twin. In the real world, this layer is known as the core adapter. Updated all references in DATABASE.md.

- **Bidirectional transaction sync documented**: Accounts remain one-directional (Mini-Core → DTW). Transactions are now documented as bidirectional — transactions can be born in the Digital Twin (e.g., Pix, RTP, card purchases) and flow inbound to Mini-Core. The Core Adapter distinguishes confirmations (has `transaction_id`) from DTW-born transactions (no `transaction_id`) in the same response channel. DTW-born transactions are created locally, firing the full trigger chain, and mapped via `dtw_transaction_mapping` with `sync_status = SYNCED`.

- **DTW-born transaction ingestion** (`transaction_from_dtw.py`): New sync process (5th) that polls `digital-twin/transaction/from-dtw/` every 10 seconds. For each JSON entry: checks `dtw_transaction_mapping` for idempotency, INSERTs into `transactions` (triggering lifecycle validation, balance update, balance snapshot, and outbox capture), then INSERTs into `dtw_transaction_mapping` linking the new local ID to the DTW transaction ID. Defaults `created_by` to `'DTW'`. Moves processed files to `trash/`.

- **Five-stage transaction directory**: Added `from-dtw/` subdirectory under `digital-twin/transaction/` for inbound DTW-born transactions, extending the existing four-stage file flow (`writing/`, `written/`, `confirm/`, `trash/`).
