# TODO: Database Architecture Improvements

## High Priority: Core Logic & Consistency

- [ ] **Data-Driven Balance Logic**: Refactor `fn_update_account_balance` to query `transaction_code_balance_effects` instead of using hardcoded `IF/ELSE` logic for direction and status.
- [ ] **Reconcile Transaction Codes**: Unify the transaction code systems. The `transactions` table should use the same type (NUMERIC) as `transaction_codes` and ideally reference it via a Foreign Key instead of a hardcoded `CHECK` constraint.
- [ ] **Fix Lifecycle Status Updates**: Resolve the "Immutable vs. Status" paradox. If transactions can move from `PENDING` to `POSTED`, the balance trigger must handle `UPDATE` events or a new mechanism for status transitions must be implemented.

## Medium Priority: Performance & Scalability

- [ ] **Optimize Sync Wait Fan-out**: Evaluate the performance impact of the "1 bulk = N sync_wait rows" trigger. Consider if a range-based check or a more efficient batching mechanism can reduce write amplification.
- [ ] **Outbox Naming Convention**: Standardize the naming of mirrored columns in `outbox_accounts` and `outbox_transactions` to make it easier for generic consumers to map back to source tables.

## Low Priority: Data Integrity & Extension

- [ ] **Currency Validation**: Add a check to ensure transactions are applied to accounts with matching `currency_code`, or implement a currency conversion layer.
- [ ] **Schema-level Constraints**: Consider moving critical metadata (like `check_number`) from `json_payload` to dedicated columns to allow for easier indexing and unique constraints.
- [ ] **Audit Trail**: Add `created_by` or similar metadata to core tables to track the source of changes.
