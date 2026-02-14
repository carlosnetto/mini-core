import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { AccountsView } from './views/AccountsView';
import { TransactionsView } from './views/TransactionsView';
import { OutboxView } from './views/OutboxView';
import { generateAccounts, generateTransactions, generateOutboxItems } from './services/mockData';
import { Account, Transaction, OutboxItem, OutboxStatus } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [acctOutbox, setAcctOutbox] = useState<OutboxItem[]>([]);
  const [txOutbox, setTxOutbox] = useState<OutboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial data load
    const loadData = () => {
      const accts = generateAccounts(50);
      const txs = generateTransactions(0, accts); // Count handled inside based on accounts
      const outboxA = generateOutboxItems(15, 'ACCOUNT');
      const outboxT = generateOutboxItems(25, 'TRANSACTION');

      setAccounts(accts);
      setTransactions(txs);
      setAcctOutbox(outboxA);
      setTxOutbox(outboxT);
      setIsLoading(false);
    };

    setTimeout(loadData, 800);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <div className="text-slate-500 font-medium">Booting Mini Core...</div>
      </div>
    );
  }

  const pendingAcctsCount = acctOutbox.filter(i => i.status === OutboxStatus.WAITING || i.status === OutboxStatus.PROCESSING).length;
  const pendingTxCount = txOutbox.filter(i => i.status === OutboxStatus.WAITING || i.status === OutboxStatus.PROCESSING).length;

  return (
    <Layout 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
      outboxAcctsCount={pendingAcctsCount}
      outboxTransCount={pendingTxCount}
    >
      {activeTab === 'accounts' && <AccountsView accounts={accounts} />}
      {activeTab === 'transactions' && <TransactionsView transactions={transactions} accounts={accounts} />}
      {activeTab === 'outbox-accts' && <OutboxView items={acctOutbox} title="Account Events" />}
      {activeTab === 'outbox-trans' && <OutboxView items={txOutbox} title="Transaction Events" />}
    </Layout>
  );
};

export default App;