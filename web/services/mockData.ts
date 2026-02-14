import { Account, AccountStatus, Currency, OutboxItem, OutboxStatus, Transaction, TransactionStatus, TransactionType } from '../types';

const generateNumericString = (length: number) => {
    let result = '';
    const characters = '0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

const generateId = () => Math.random().toString(36).substring(2, 10).toUpperCase();

const randomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
};

const currencies = [Currency.USD, Currency.USDC];
const accountStatuses = [
    AccountStatus.ACTIVE, 
    AccountStatus.ACTIVE, 
    AccountStatus.ACTIVE, 
    AccountStatus.FROZEN, 
    AccountStatus.DORMANT
];

const txCodes = [
    { code: '101', desc: 'Cash Deposit', type: TransactionType.CREDIT },
    { code: '105', desc: 'Mobile Check Deposit', type: TransactionType.CREDIT },
    { code: '200', desc: 'ATM Withdrawal', type: TransactionType.DEBIT },
    { code: '205', desc: 'POS Purchase', type: TransactionType.DEBIT },
    { code: '300', desc: 'Internal Transfer In', type: TransactionType.TRANSFER, isCredit: true },
    { code: '301', desc: 'Internal Transfer Out', type: TransactionType.TRANSFER, isCredit: false },
    { code: '400', desc: 'Wire Transfer In', type: TransactionType.CREDIT },
    { code: '450', desc: 'Wire Transfer Out', type: TransactionType.DEBIT },
    { code: '900', desc: 'Monthly Maintenance Fee', type: TransactionType.FEE }
];

export const generateAccounts = (count: number): Account[] => {
  return Array.from({ length: count }).map(() => {
    const available = parseFloat((Math.random() * 50000).toFixed(2));
    // Collected is usually >= available
    const collected = available + parseFloat((Math.random() * 2000).toFixed(2));
    
    return {
        id: generateNumericString(10),
        branchNumber: generateNumericString(9),
        accountNumber: generateNumericString(10),
        availableBalance: available,
        collectedBalance: collected,
        currency: currencies[Math.floor(Math.random() * currencies.length)],
        status: accountStatuses[Math.floor(Math.random() * accountStatuses.length)],
        createdAt: randomDate(new Date(2023, 0, 1), new Date()).split('T')[0], // Just date
        lastUpdated: new Date().toISOString()
    };
  });
};

export const generateTransactions = (countTotal: number, accounts: Account[]): Transaction[] => {
  const allTransactions: Transaction[] = [];
  
  // We want to generate history for each account to ensure balances make sense.
  // Since we are mocking, we'll generate transactions BACKWARDS from current balance.
  
  accounts.forEach(account => {
      let currentAvail = account.availableBalance;
      let currentColl = account.collectedBalance;
      
      const numTx = Math.floor(Math.random() * 15) + 5; // 5 to 20 tx per account
      
      for (let i = 0; i < numTx; i++) {
          const txTemplate = txCodes[Math.floor(Math.random() * txCodes.length)];
          const amount = parseFloat((Math.random() * 1000 + 10).toFixed(2));
          
          let realType = txTemplate.type;
          
          // Determine direction
          let isCredit = false;
          if (txTemplate.type === TransactionType.CREDIT) isCredit = true;
          if (txTemplate.type === TransactionType.TRANSFER && (txTemplate as any).isCredit) isCredit = true;
          
          // If Fee, it's a debit
          if (txTemplate.type === TransactionType.FEE) {
              realType = TransactionType.FEE;
              isCredit = false;
          }

          const timestamp = new Date(Date.now() - (i * 86400000 + Math.random() * 80000000));
          
          const tx: Transaction = {
              id: generateNumericString(12),
              accountId: account.id,
              amount: amount,
              currency: account.currency,
              type: realType,
              status: TransactionStatus.COMPLETED,
              timestamp: timestamp.toISOString(),
              effectiveDate: timestamp.toISOString().split('T')[0],
              transactionCode: txTemplate.code,
              description: txTemplate.desc,
              postBalanceAvailable: Number(currentAvail.toFixed(2)),
              postBalanceCollected: Number(currentColl.toFixed(2)),
              reference: `REF-${generateNumericString(8)}`
          };

          allTransactions.push(tx);

          // Update "current" balance (moving backwards in time, so we reverse the operation)
          // If the transaction WAS a credit (added money), the balance BEFORE it was Lower.
          // If the transaction WAS a debit (removed money), the balance BEFORE it was Higher.
          if (isCredit) {
              currentAvail -= amount;
              currentColl -= amount;
          } else {
              currentAvail += amount;
              currentColl += amount;
          }
      }
  });

  return allTransactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const generateOutboxItems = (count: number, type: 'ACCOUNT' | 'TRANSACTION'): OutboxItem[] => {
  return Array.from({ length: count }).map(() => {
    const status = [OutboxStatus.SENT, OutboxStatus.SENT, OutboxStatus.PROCESSING, OutboxStatus.WAITING][Math.floor(Math.random() * 4)];
    const eventType = type === 'ACCOUNT' ? (Math.random() > 0.5 ? 'ACCOUNT_CREATED' : 'ACCOUNT_UPDATED') : 'TRANSACTION_POSTED';
    
    return {
      id: `EVT-${generateId()}`,
      entityType: type,
      entityId: generateNumericString(10),
      eventType: eventType,
      payload: JSON.stringify({
        timestamp: new Date().toISOString(),
        version: "1.0",
        data: {
            fieldA: "some_value",
            meta: Math.random().toString(36)
        }
      }, null, 2),
      status: status,
      createdAt: randomDate(new Date(Date.now() - 86400000), new Date()),
      retryCount: status === OutboxStatus.FAILED ? Math.floor(Math.random() * 5) : 0
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};