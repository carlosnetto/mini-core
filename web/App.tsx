import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { AccountsView } from './views/AccountsView';
import { TransactionsView } from './views/TransactionsView';
import { OutboxView } from './views/OutboxView';
import { fetchAccounts, fetchOutboxAccounts, fetchOutboxTransactions } from './services/api';
import { Account, OutboxAccountEvent, OutboxTransactionEvent, SyncStatus } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('accounts');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [acctOutbox, setAcctOutbox] = useState<OutboxAccountEvent[]>([]);
  const [txOutbox, setTxOutbox] = useState<OutboxTransactionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [accts, outboxA, outboxT] = await Promise.all([
        fetchAccounts(),
        fetchOutboxAccounts(),
        fetchOutboxTransactions(),
      ]);
      setAccounts(accts);
      setAcctOutbox(outboxA);
      setTxOutbox(outboxT);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <div className="text-slate-500 font-medium">Booting Mini Core...</div>
      </div>
    );
  }

  const pendingAcctsCount = acctOutbox.filter(i => i.sync_status === SyncStatus.PENDING || i.sync_status === SyncStatus.WAITING).length;
  const pendingTxCount = txOutbox.filter(i => i.sync_status === SyncStatus.PENDING || i.sync_status === SyncStatus.WAITING).length;

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      outboxAcctsCount={pendingAcctsCount}
      outboxTransCount={pendingTxCount}
    >
      {activeTab === 'accounts' && <AccountsView accounts={accounts} onRefresh={loadData} onNavigateToTransactions={(id) => { setSelectedAccountId(id); setActiveTab('transactions'); }} />}
      {activeTab === 'transactions' && <TransactionsView accounts={accounts} initialAccountId={selectedAccountId} onRefresh={loadData} />}
      {activeTab === 'outbox-accts' && <OutboxView items={acctOutbox} title="Account Events" type="accounts" />}
      {activeTab === 'outbox-trans' && <OutboxView items={txOutbox} title="Transaction Events" type="transactions" />}
    </Layout>
  );
};

export default App;
