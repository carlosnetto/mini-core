import { Account, Transaction, OutboxAccountEvent, OutboxTransactionEvent, OutboxTransactionEventDetail, OutboxAccountEventDetail } from '../types';

const BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchAccounts(search?: string): Promise<Account[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return fetchJson(`${BASE}/accounts${params}`);
}

export function fetchAccount(accountId: number): Promise<Account> {
  return fetchJson(`${BASE}/accounts/${accountId}`);
}

export function fetchAccountTransactions(accountId: number): Promise<Transaction[]> {
  return fetchJson(`${BASE}/accounts/${accountId}/transactions`);
}

export function fetchOutboxAccounts(): Promise<OutboxAccountEvent[]> {
  return fetchJson(`${BASE}/outbox/accounts`);
}

export function fetchOutboxTransactions(): Promise<OutboxTransactionEvent[]> {
  return fetchJson(`${BASE}/outbox/transactions`);
}

export function fetchOutboxTransactionDetail(eventId: number): Promise<OutboxTransactionEventDetail> {
  return fetchJson(`${BASE}/outbox/transactions/${eventId}`);
}

export function fetchOutboxAccountDetail(eventId: number): Promise<OutboxAccountEventDetail> {
  return fetchJson(`${BASE}/outbox/accounts/${eventId}`);
}

export async function createAccount(data: {
  account_number: string;
  product_type: string;
  currency_code: string;
  created_by?: string;
}): Promise<Account> {
  const res = await fetch(`${BASE}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export async function updateAccountStatus(accountId: number, status: string): Promise<Account> {
  const res = await fetch(`${BASE}/accounts/${accountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export interface TransactionCodeOption {
  transaction_code: number;
  description: string;
  effects: { balance_name: string; effect: number }[];
}

export function fetchTransactionCodes(): Promise<TransactionCodeOption[]> {
  return fetchJson(`${BASE}/transaction-codes`);
}

export async function createTransaction(data: {
  account_id: number;
  transaction_code: number;
  amount: number;
  direction: string;
  status: string;
  original_transaction_id?: number;
  effective_date?: string;
  created_by?: string;
}): Promise<any> {
  const res = await fetch(`${BASE}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
