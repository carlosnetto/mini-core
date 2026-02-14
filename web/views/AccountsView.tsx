import React, { useMemo, useState } from 'react';
import { Account } from '../types';
import { Badge } from '../components/ui/Badge';
import { Search, Filter, Download, Plus } from 'lucide-react';

interface AccountsViewProps {
  accounts: Account[];
}

export const AccountsView: React.FC<AccountsViewProps> = ({ accounts }) => {
  const [filter, setFilter] = useState('');

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => 
      acc.accountNumber.includes(filter) || 
      acc.id.includes(filter) ||
      acc.branchNumber.includes(filter)
    );
  }, [accounts, filter]);

  return (
    <div className="space-y-6">
      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search ID, Branch or Number..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              <Filter size={16} />
              <span>Filter</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              <Download size={16} />
              <span>Export</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-white bg-matera-blue rounded-lg text-sm hover:bg-matera-lightBlue transition-colors shadow-sm">
              <Plus size={16} />
              <span>New Account</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-600">Account ID</th>
                <th className="px-6 py-3 font-semibold text-slate-600">Branch / Number</th>
                <th className="px-6 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-6 py-3 font-semibold text-slate-600">Currency</th>
                <th className="px-6 py-3 font-semibold text-slate-600 text-right">Available</th>
                <th className="px-6 py-3 font-semibold text-slate-600 text-right">Collected</th>
                <th className="px-6 py-3 font-semibold text-slate-600 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.map((account) => (
                <tr key={account.id} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 font-mono text-slate-600 font-medium">{account.id}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                        <span className="font-medium text-slate-900">{account.accountNumber}</span>
                        <span className="text-xs text-slate-400">Br: {account.branchNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={account.status}>{account.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{account.currency}</td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-slate-800">
                    {account.availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-500">
                    {account.collectedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500">{account.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination (Mock) */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredAccounts.length} of {accounts.length} results</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50">Prev</button>
            <button className="px-3 py-1 bg-matera-blue text-white rounded shadow-sm">1</button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">2</button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">3</button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};