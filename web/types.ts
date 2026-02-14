// Enums matching PostgreSQL types

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  DORMANT = 'DORMANT',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

export enum TransactionDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export enum SyncStatus {
  PENDING = 'PENDING',
  WAITING = 'WAITING',
  CONFIRMED = 'CONFIRMED',
}

// Core types matching database columns

export interface Account {
  account_id: number;
  account_number: string;
  product_type: string;
  status: AccountStatus;
  available_balance: number;
  collected_balance: number;
  currency_code: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  transaction_id: number;
  account_id: number;
  original_transaction_id: number | null;
  transaction_code: number;
  transaction_description: string;
  amount: number;
  direction: TransactionDirection;
  status: TransactionStatus;
  json_payload: any | null;
  effective_date: string;
  created_by: string | null;
  created_at: string;
  post_available_balance: number | null;
  post_collected_balance: number | null;
}

// Outbox types matching mirrored columns + computed sync_status

export interface OutboxAccountEvent {
  event_id: number;
  operation_type: string;
  snapshot_type: string;
  account_id: number;
  account_number: string;
  product_type: string;
  status: string;
  available_balance: number;
  collected_balance: number;
  currency_code: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  event_created_at: string;
  sync_status: SyncStatus;
}

export interface OutboxTransactionEvent {
  event_id: number;
  operation_type: string;
  transaction_id: number;
  account_id: number;
  original_transaction_id: number | null;
  transaction_code: number;
  amount: number;
  direction: string;
  status: string;
  json_payload: any | null;
  effective_date: string;
  created_by: string | null;
  created_at: string;
  event_created_at: string;
  sync_status: SyncStatus;
}
