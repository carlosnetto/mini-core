import React, { useMemo, useState } from 'react';
import { Account, Transaction, TransactionType } from '../types';
import { Badge } from '../components/ui/Badge';
import { Search, ChevronDown, Building2, Wallet, ArrowUpRight, ArrowDownLeft, FileText } from 'lucide-react';

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: Account[];
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ transactions, accounts }) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');

  const selectedAccount = useMemo(() => 
    accounts.find(a => a.id === selectedAccountId), 
  [accounts, selectedAccountId]);

  const accountTransactions = useMemo(() => 
    transactions.filter(tx => tx.accountId === selectedAccountId),
  [transactions, selectedAccountId]);

  const filteredAccounts = useMemo(() => 
    accounts.filter(a => 
      a.id.includes(accountSearch) || 
      a.accountNumber.includes(accountSearch)
    ),
  [accounts, accountSearch]);

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
                    <span className="font-mono">{selectedAccount.accountNumber}</span>
                    <Badge status={selectedAccount.status}>{selectedAccount.status}</Badge>
                  </span>
                  <span className="text-xs text-slate-500">ID: {selectedAccount.id} • Branch: {selectedAccount.branchNumber}</span>
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
                    key={acc.id}
                    onClick={() => {
                      setSelectedAccountId(acc.id);
                      setIsDropdownOpen(false);
                      setAccountSearch('');
                    }}
                    className="p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex justify-between items-center group"
                  >
                    <div>
                      <div className="font-medium text-slate-700 group-hover:text-matera-blue">{acc.accountNumber}</div>
                      <div className="text-xs text-slate-500 font-mono">ID: {acc.id}</div>
                    </div>
                    <div className="text-right">
                       <div className="text-sm font-bold text-slate-700">{acc.currency}</div>
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
                      {selectedAccount.currency}
                   </span>
                </div>
                <div>
                   <p className="text-blue-100 text-sm font-medium">Collected Balance</p>
                   <h3 className="text-3xl font-bold tracking-tight mt-1">
                      {selectedAccount.collectedBalance.toLocaleString('en-US', { style: 'currency', currency: selectedAccount.currency })}
                   </h3>
                </div>
             </div>

             <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center">
                <div>
                   <p className="text-slate-500 text-sm font-medium mb-1">Available Balance</p>
                   <h3 className="text-2xl font-bold text-slate-800">
                      {selectedAccount.availableBalance.toLocaleString('en-US', { style: 'currency', currency: selectedAccount.currency })}
                   </h3>
                </div>
             </div>

             <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center gap-3">
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                   <span className="text-sm text-slate-500">Account Status</span>
                   <Badge status={selectedAccount.status}>{selectedAccount.status}</Badge>
                </div>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                   <span className="text-sm text-slate-500">Open Date</span>
                   <span className="text-sm font-medium text-slate-800">{selectedAccount.createdAt}</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-sm text-slate-500">Last Activity</span>
                   <span className="text-sm font-medium text-slate-800">{new Date(selectedAccount.lastUpdated).toLocaleDateString()}</span>
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
                <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded">
                   {accountTransactions.length} records found
                </span>
             </div>
             
             <div className="overflow-auto custom-scrollbar flex-1">
                <table className="w-full text-left text-xs relative">
                   <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold sticky top-0 z-10 shadow-sm">
                      <tr>
                         <th className="px-6 py-3 bg-slate-50">Timestamp / As Of</th>
                         <th className="px-6 py-3 bg-slate-50">Tx ID</th>
                         <th className="px-6 py-3 bg-slate-50">Code</th>
                         <th className="px-6 py-3 bg-slate-50">Description</th>
                         <th className="px-6 py-3 text-center bg-slate-50">Dr/Cr</th>
                         <th className="px-6 py-3 text-right bg-slate-50">Amount</th>
                         <th className="px-6 py-3 text-right bg-slate-100 border-l border-slate-200">Post Avail</th>
                         <th className="px-6 py-3 text-right bg-slate-100">Post Coll</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {accountTransactions.length > 0 ? (
                        accountTransactions.map((tx) => {
                           const isDebit = tx.type === TransactionType.DEBIT || tx.type === TransactionType.FEE || (tx.type === TransactionType.TRANSFER && tx.description.includes('Out'));
                           
                           return (
                              <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-3">
                                    <div className="flex flex-col">
                                       <span className="font-medium text-slate-700">{new Date(tx.timestamp).toLocaleString()}</span>
                                       <span className="text-slate-400">As of: {tx.effectiveDate}</span>
                                    </div>
                                 </td>
                                 <td className="px-6 py-3 font-mono text-slate-500">{tx.id}</td>
                                 <td className="px-6 py-3 font-mono font-medium text-slate-700">{tx.transactionCode}</td>
                                 <td className="px-6 py-3 text-slate-700">{tx.description}</td>
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
                                    {tx.postBalanceAvailable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                 </td>
                                 <td className="px-6 py-3 text-right font-mono text-slate-600 bg-slate-50/30">
                                    {tx.postBalanceCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                 </td>
                              </tr>
                           );
                        })
                      ) : (
                        <tr>
                           <td colSpan={8} className="px-6 py-12 text-center text-slate-500 bg-slate-50/30">
                              <div className="flex flex-col items-center gap-2">
                                <FileText size={32} className="text-slate-300" />
                                <p className="font-medium">No transactions found</p>
                                <p className="text-xs text-slate-400">This account has no history to display.</p>
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
    </div>
  );
};