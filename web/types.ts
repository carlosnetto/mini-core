export enum Currency {
  USD = 'USD',
  USDC = 'USDC',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
  PENDING = 'PENDING',
  DORMANT = 'DORMANT'
}

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  TRANSFER = 'TRANSFER',
  FEE = 'FEE'
}

export enum TransactionStatus {
  COMPLETED = 'COMPLETED',
  PENDING = 'PENDING',
  FAILED = 'FAILED'
}

export enum OutboxStatus {
  WAITING = 'WAITING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED'
}

export interface Account {
  id: string; // 10 digit number
  branchNumber: string; // 9 digits
  accountNumber: string; // US format
  availableBalance: number;
  collectedBalance: number;
  currency: Currency;
  status: AccountStatus;
  createdAt: string;
  lastUpdated: string;
}

export interface Transaction {
  id: string;
  accountId: string; // The account this affects
  counterpartyAccountId?: string; // Optional other party
  amount: number;
  currency: Currency;
  type: TransactionType;
  status: TransactionStatus;
  timestamp: string;
  effectiveDate: string; // "As Of" date
  transactionCode: string;
  description: string;
  postBalanceAvailable: number;
  postBalanceCollected: number;
  reference: string;
}

export interface OutboxItem {
  id: string;
  entityType: 'ACCOUNT' | 'TRANSACTION';
  entityId: string;
  eventType: string;
  payload: string; // JSON string
  status: OutboxStatus;
  createdAt: string;
  retryCount: number;
}