import React, { useMemo, useState, useEffect } from 'react';
import { Account, Transaction, TransactionDirection } from '../types';
import { Badge } from '../components/ui/Badge';
import { fetchAccountTransactions, fetchTransactionCodes, createTransaction, TransactionCodeOption } from '../services/api';
import { Search, ChevronDown, Wallet, ArrowUpRight, ArrowDownLeft, FileText, Plus, X, AlertTriangle, Check, Ban } from 'lucide-react';

interface TransactionsViewProps {
  accounts: Account[];
  initialAccountId?: number | null;
  onRefresh?: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ accounts, initialAccountId, onRefresh }) => {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(initialAccountId ?? null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  // Status action dropdown for PENDING transactions
  const [statusActionTx, setStatusActionTx] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  // New Transaction modal state
  const [showModal, setShowModal] = useState(false);
  const [txCodes, setTxCodes] = useState<TransactionCodeOption[]>([]);
  const [codeSearch, setCodeSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [form, setForm] = useState({
    transaction_code: 0,
    amount: '',
    status: 'POSTED',
    original_transaction_id: '',
    effective_date: new Date().toISOString().split('T')[0],
    created_by: '',
  });

  const selectedAccount = useMemo(() =>
    accounts.find(a => a.account_id === selectedAccountId),
  [accounts, selectedAccountId]);

  const filteredAccounts = useMemo(() =>
    accounts.filter(a =>
      String(a.account_id).includes(accountSearch) ||
      a.account_number.includes(accountSearch)
    ),
  [accounts, accountSearch]);

  const filteredCodes = useMemo(() => {
    if (!codeSearch) return txCodes;
    const q = codeSearch.toLowerCase();
    return txCodes.filter(c =>
      String(c.transaction_code).includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  }, [txCodes, codeSearch]);

  useEffect(() => {
    if (initialAccountId != null) setSelectedAccountId(initialAccountId);
  }, [initialAccountId]);

  const loadTransactions = () => {
    if (selectedAccountId == null) {
      setTransactions([]);
      return;
    }
    setLoadingTx(true);
    fetchAccountTransactions(selectedAccountId)
      .then(setTransactions)
      .catch(err => console.error('Failed to load transactions:', err))
      .finally(() => setLoadingTx(false));
  };

  useEffect(loadTransactions, [selectedAccountId]);

  const openModal = async () => {
    setForm({
      transaction_code: 0,
      amount: '',
      status: 'POSTED',
      original_transaction_id: '',
      effective_date: new Date().toISOString().split('T')[0],
      created_by: '',
    });
    setCodeSearch('');
    setBackendError('');
    setShowModal(true);
    if (txCodes.length === 0) {
      const codes = await fetchTransactionCodes();
      setTxCodes(codes);
    }
  };

  const selectedCode = txCodes.find(c => c.transaction_code === form.transaction_code);
  const derivedDirection = selectedCode?.effects?.[0]?.effect === -1 ? 'DEBIT' : 'CREDIT';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !selectedCode) return;
    setSaving(true);
    setBackendError('');
    try {
      await createTransaction({
        account_id: selectedAccountId,
        transaction_code: form.transaction_code,
        amount: parseFloat(form.amount),
        direction: derivedDirection,
        status: form.status,
        original_transaction_id: form.original_transaction_id ? parseInt(form.original_transaction_id) : undefined,
        effective_date: form.effective_date || undefined,
        created_by: form.created_by || undefined,
      });
      setShowModal(false);
      loadTransactions();
      onRefresh?.();
    } catch (err: any) {
      setBackendError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (tx: Transaction, action: 'POSTED' | 'CANCELLED') => {
    setStatusActionTx(null);
    try {
      await createTransaction({
        account_id: tx.account_id,
        transaction_code: tx.transaction_code,
        amount: tx.amount,
        direction: tx.direction,
        status: action,
        original_transaction_id: tx.transaction_id,
      });
      loadTransactions();
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Selection Area */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative z-50">
        <label className="block text-sm font-medium text-slate-700 mb-2">Select Account for Ledger View</label>
        <div className="relative max-w-xl">
          <div
            className="flex items-center justify-between w-full px-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm cursor-pointer hover:border-matera-blue transition-colors"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
             {selectedAccount ? (
               <div className="flex flex-col">
                  <span className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="font-mono">{selectedAccount.account_number}</span>
                    <Badge status={selectedAccount.status}>{selectedAccount.status}</Badge>
                  </span>
                  <span className="text-xs text-slate-500">ID: {selectedAccount.account_id} &bull; {selectedAccount.product_type} &bull; {selectedAccount.currency_code}</span>
               </div>
             ) : (
               <span className="text-slate-500">Search or select an account...</span>
             )}
             <ChevronDown size={20} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </div>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-80 overflow-hidden flex flex-col z-50">
              <div className="p-3 border-b border-slate-100 bg-slate-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Filter by ID or Number"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-matera-blue"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                {filteredAccounts.map(acc => (
                  <div
                    key={acc.account_id}
                    onClick={() => {
                      setSelectedAccountId(acc.account_id);
                      setIsDropdownOpen(false);
                      setAccountSearch('');
                    }}
                    className="p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex justify-between items-center group"
                  >
                    <div>
                      <div className="font-medium text-slate-700 group-hover:text-matera-blue">{acc.account_number}</div>
                      <div className="text-xs text-slate-500 font-mono">ID: {acc.account_id}</div>
                    </div>
                    <div className="text-right">
                       <div className="text-sm font-bold text-slate-700">{acc.currency_code}</div>
                       <Badge status={acc.status} className="scale-90 origin-right">{acc.status}</Badge>
                    </div>
                  </div>
                ))}
                {filteredAccounts.length === 0 && (
                  <div className="p-4 text-center text-sm text-slate-500">No accounts found</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedAccount ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-gradient-to-br from-matera-blue to-blue-900 rounded-xl p-6 text-white shadow-lg">
                <div className="flex items-start justify-between mb-4">
                   <div className="p-2 bg-white/10 rounded-lg">
                      <Wallet className="text-matera-orange" size={24} />
                   </div>
                   <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded text-white/90">
                      {selectedAccount.currency_code}
                   </span>
                </div>
                <div>
                   <p className="text-blue-100 text-sm font-medium">Collected Balance</p>
                   <h3 className="text-3xl font-bold tracking-tight mt-1">
                      {selectedAccount.collected_balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                   </h3>
                </div>
             </div>

             <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center">
                <div>
                   <p className="text-slate-500 text-sm font-medium mb-1">Available Balance</p>
                   <h3 className="text-2xl font-bold text-slate-800">
                      {selectedAccount.available_balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                   </h3>
                </div>
             </div>

             <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center gap-3">
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                   <span className="text-sm text-slate-500">Account Status</span>
                   <Badge status={selectedAccount.status}>{selectedAccount.status}</Badge>
                </div>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                   <span className="text-sm text-slate-500">Product</span>
                   <span className="text-sm font-medium text-slate-800">{selectedAccount.product_type}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                   <span className="text-sm text-slate-500">Open Date</span>
                   <span className="text-sm font-medium text-slate-800">{new Date(selectedAccount.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-sm text-slate-500">Last Updated</span>
                   <span className="text-sm font-medium text-slate-800">{new Date(selectedAccount.updated_at).toLocaleDateString()}</span>
                </div>
             </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
             <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center shrink-0">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <FileText size={18} className="text-slate-400" />
                  Transaction History
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded">
                     {loadingTx ? 'loading...' : `${transactions.length} records found`}
                  </span>
                  <button
                    onClick={openModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-white bg-matera-blue rounded-lg text-xs font-medium hover:bg-matera-lightBlue transition-colors shadow-sm"
                  >
                    <Plus size={14} />
                    New Transaction
                  </button>
                </div>
             </div>

             <div className="overflow-auto custom-scrollbar flex-1">
                <table className="w-full text-left text-xs relative">
                   <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold sticky top-0 z-10 shadow-sm">
                      <tr>
                         <th className="px-6 py-3 bg-slate-50">Timestamp / As Of</th>
                         <th className="px-6 py-3 bg-slate-50">Tx ID</th>
                         <th className="px-6 py-3 bg-slate-50">Status</th>
                         <th className="px-6 py-3 bg-slate-50">Code</th>
                         <th className="px-6 py-3 bg-slate-50">Description</th>
                         <th className="px-6 py-3 text-center bg-slate-50">Dr/Cr</th>
                         <th className="px-6 py-3 text-right bg-slate-50">Amount</th>
                         <th className="px-6 py-3 text-right bg-slate-100 border-l border-slate-200">Post Avail</th>
                         <th className="px-6 py-3 text-right bg-slate-100">Post Coll</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {transactions.length > 0 ? (
                        transactions.map((tx) => {
                           const isDebit = tx.direction === TransactionDirection.DEBIT;

                           return (
                              <tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-3">
                                    <div className="flex flex-col">
                                       <span className="font-medium text-slate-700">{new Date(tx.created_at).toLocaleString()}</span>
                                       <span className="text-slate-400">As of: {tx.effective_date}</span>
                                    </div>
                                 </td>
                                 <td className="px-6 py-3">
                                    <div className="flex flex-col">
                                       <span className="font-mono text-slate-500">{tx.transaction_id}</span>
                                       {tx.original_transaction_id && (
                                         <span className="text-[10px] text-slate-400">orig: {tx.original_transaction_id}</span>
                                       )}
                                    </div>
                                 </td>
                                 <td className="px-6 py-3 relative">
                                    {tx.status === 'PENDING' && !tx.original_transaction_id ? (
                                      <>
                                        <button onClick={() => setStatusActionTx(statusActionTx === tx.transaction_id ? null : tx.transaction_id)}>
                                          <Badge status={tx.status} className="cursor-pointer hover:ring-2 hover:ring-amber-300">{tx.status}</Badge>
                                        </button>
                                        {statusActionTx === tx.transaction_id && (
                                          <div className="absolute top-full left-4 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
                                            <button
                                              onClick={() => handleStatusAction(tx, 'POSTED')}
                                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-emerald-700"
                                            >
                                              <Check size={14} /> Post (Confirm)
                                            </button>
                                            <button
                                              onClick={() => handleStatusAction(tx, 'CANCELLED')}
                                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-rose-700"
                                            >
                                              <Ban size={14} /> Cancel
                                            </button>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <Badge status={tx.status}>{tx.status}</Badge>
                                    )}
                                 </td>
                                 <td className="px-6 py-3 font-mono font-medium text-slate-700">{tx.transaction_code}</td>
                                 <td className="px-6 py-3 text-slate-700">{tx.transaction_description}</td>
                                 <td className="px-6 py-3 text-center">
                                    {isDebit ? (
                                      <span className="inline-flex items-center gap-1 text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                                         <ArrowUpRight size={10} strokeWidth={3} /> D
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                         <ArrowDownLeft size={10} strokeWidth={3} /> C
                                      </span>
                                    )}
                                 </td>
                                 <td className={`px-6 py-3 text-right font-mono font-medium text-sm ${isDebit ? 'text-slate-900' : 'text-emerald-700'}`}>
                                    {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                 </td>
                                 <td className="px-6 py-3 text-right font-mono text-slate-600 bg-slate-50/30 border-l border-slate-50">
                                    {tx.post_available_balance != null ? tx.post_available_balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                                 </td>
                                 <td className="px-6 py-3 text-right font-mono text-slate-600 bg-slate-50/30">
                                    {tx.post_collected_balance != null ? tx.post_collected_balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                                 </td>
                              </tr>
                           );
                        })
                      ) : (
                        <tr>
                           <td colSpan={9} className="px-6 py-12 text-center text-slate-500 bg-slate-50/30">
                              <div className="flex flex-col items-center gap-2">
                                <FileText size={32} className="text-slate-300" />
                                <p className="font-medium">{loadingTx ? 'Loading transactions...' : 'No transactions found'}</p>
                                <p className="text-xs text-slate-400">{loadingTx ? '' : 'This account has no history to display.'}</p>
                              </div>
                           </td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-slate-200 border-dashed">
            <div className="bg-slate-50 p-6 rounded-full mb-4 ring-1 ring-slate-100">
               <Search size={40} className="text-slate-400" />
            </div>
            <h3 className="text-xl font-medium text-slate-900">No Account Selected</h3>
            <p className="text-slate-500 text-sm mt-2 max-w-sm text-center">
               Please search and select an account from the dropdown above to view the detailed transaction ledger and balances.
            </p>
        </div>
      )}

      {/* Backend Error Modal (status actions) */}
      {actionError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActionError('')} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Operation Failed</h2>
                <div className="bg-slate-900 rounded-md p-3 font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-words">
                  {actionError}
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={() => setActionError('')} className="px-4 py-2 text-sm text-white bg-matera-blue rounded-lg hover:bg-matera-lightBlue transition-colors shadow-sm">
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl z-10">
              <h2 className="text-lg font-bold text-slate-800">New Transaction</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Transaction Code picker */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Transaction Code</label>
                {selectedCode ? (
                  <div>
                    <div className="flex items-center justify-between px-3 py-2 border border-slate-300 rounded-lg bg-slate-50">
                      <span className="text-sm">
                        <span className="font-mono font-bold text-slate-800">{selectedCode.transaction_code}</span>
                        <span className="text-slate-600 ml-2">{selectedCode.description}</span>
                      </span>
                      <button type="button" onClick={() => setForm({ ...form, transaction_code: 0 })} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    </div>
                    {selectedCode.effects.length > 0 && (
                      <div className="mt-2 flex items-center gap-3 px-1">
                        <span className="text-xs text-slate-400">Balance effects:</span>
                        {selectedCode.effects.map(e => (
                          <span key={e.balance_name} className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            e.effect > 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {e.balance_name} {e.effect > 0 ? '+1' : '-1'}
                          </span>
                        ))}
                        <span className={`text-xs font-bold ${derivedDirection === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          → {derivedDirection}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Search by code or description..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue"
                        value={codeSearch}
                        onChange={e => setCodeSearch(e.target.value)}
                      />
                    </div>
                    <div className="mt-1 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                      {filteredCodes.map(c => (
                        <button
                          type="button"
                          key={c.transaction_code}
                          onClick={() => { setForm({ ...form, transaction_code: c.transaction_code }); setCodeSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0"
                        >
                          <span className="font-mono font-bold text-slate-700 w-14 shrink-0">{c.transaction_code}</span>
                          <span className="text-slate-600 truncate flex-1">{c.description}</span>
                          {c.effects.length > 0 && (
                            <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded ${
                              c.effects[0].effect > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'
                            }`}>
                              {c.effects[0].effect > 0 ? 'CR' : 'DR'}
                            </span>
                          )}
                        </button>
                      ))}
                      {filteredCodes.length === 0 && (
                        <div className="p-3 text-center text-sm text-slate-400">No codes found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue bg-white"
                  >
                    <option value="POSTED">POSTED</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Effective Date</label>
                  <input
                    type="date"
                    value={form.effective_date}
                    onChange={e => setForm({ ...form, effective_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Original Tx ID <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="number"
                    value={form.original_transaction_id}
                    onChange={e => setForm({ ...form, original_transaction_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue"
                    placeholder="e.g. 100000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Created By <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    maxLength={20}
                    value={form.created_by}
                    onChange={e => setForm({ ...form, created_by: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue"
                    placeholder="e.g. admin"
                  />
                </div>
              </div>

              {backendError && (
                <div className="p-3 bg-slate-900 rounded-lg text-xs font-mono text-slate-300 flex items-start gap-3">
                  <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap break-words">{backendError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || form.transaction_code === 0}
                  className="px-4 py-2 text-sm text-white bg-matera-blue rounded-lg hover:bg-matera-lightBlue transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
