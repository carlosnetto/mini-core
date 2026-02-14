import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Account, AccountStatus } from '../types';
import { Badge } from '../components/ui/Badge';
import { createAccount, updateAccountStatus } from '../services/api';
import { Search, Filter, Download, Plus, X, Ban, AlertTriangle } from 'lucide-react';

interface AccountsViewProps {
  accounts: Account[];
  onRefresh?: () => void;
  onNavigateToTransactions?: (accountId: number) => void;
}

const PRODUCT_TYPES = ['DDA', 'SAV', 'MMA', 'HSA', 'CD'];
const CURRENCIES = ['USD', 'BRL', 'USDC', 'USDT', 'POL', 'ETH', 'BRL1', 'BRLD', 'BRLV', 'BRLN'];

export const AccountsView: React.FC<AccountsViewProps> = ({ accounts, onRefresh, onNavigateToTransactions }) => {
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showStub, setShowStub] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState<number | null>(null);
  const [backendError, setBackendError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const ALL_STATUSES = Object.values(AccountStatus);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusDropdown(null);
      }
    };
    if (statusDropdown !== null) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusDropdown]);

  const handleStatusChange = async (accountId: number, newStatus: string) => {
    setStatusDropdown(null);
    try {
      await updateAccountStatus(accountId, newStatus);
      onRefresh?.();
    } catch (err: any) {
      setBackendError(err.message);
    }
  };

  const [form, setForm] = useState({
    account_number: '',
    product_type: 'DDA',
    currency_code: 'USD',
    created_by: '',
  });

  const filteredAccounts = useMemo(() => {
    if (!filter) return accounts;
    const q = filter.toLowerCase();
    return accounts.filter(acc =>
      acc.account_number.toLowerCase().includes(q) ||
      String(acc.account_id).includes(q) ||
      acc.product_type.toLowerCase().includes(q)
    );
  }, [accounts, filter]);

  const openModal = () => {
    setForm({ account_number: '', product_type: 'DDA', currency_code: 'USD', created_by: '' });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createAccount({
        account_number: form.account_number,
        product_type: form.product_type,
        currency_code: form.currency_code,
        created_by: form.created_by || undefined,
      });
      setShowModal(false);
      onRefresh?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search ID, Number or Product..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowStub(true)} className="flex items-center gap-2 px-3 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              <Filter size={16} />
              <span>Filter</span>
            </button>
            <button onClick={() => setShowStub(true)} className="flex items-center gap-2 px-3 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              <Download size={16} />
              <span>Export</span>
            </button>
            <button
              onClick={openModal}
              className="flex items-center gap-2 px-3 py-2 text-white bg-matera-blue rounded-lg text-sm hover:bg-matera-lightBlue transition-colors shadow-sm"
            >
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
                <th className="px-6 py-3 font-semibold text-slate-600">Number</th>
                <th className="px-6 py-3 font-semibold text-slate-600">Product</th>
                <th className="px-6 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-6 py-3 font-semibold text-slate-600">Currency</th>
                <th className="px-6 py-3 font-semibold text-slate-600 text-right">Available</th>
                <th className="px-6 py-3 font-semibold text-slate-600 text-right">Collected</th>
                <th className="px-6 py-3 font-semibold text-slate-600 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.map((account, idx) => {
                const openUp = idx >= filteredAccounts.length - 2;
                return (
                <tr key={account.account_id} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 font-mono text-slate-600 font-medium">{account.account_id}</td>
                  <td className="px-6 py-4 font-medium text-matera-blue hover:text-matera-lightBlue cursor-pointer underline decoration-matera-blue/30 hover:decoration-matera-lightBlue" onClick={() => onNavigateToTransactions?.(account.account_id)}>{account.account_number}</td>
                  <td className="px-6 py-4 text-slate-600">{account.product_type}</td>
                  <td className="px-6 py-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setStatusDropdown(statusDropdown === account.account_id ? null : account.account_id); }}>
                      <Badge status={account.status} className="cursor-pointer hover:ring-2 hover:ring-matera-blue/30">{account.status}</Badge>
                    </button>
                    {statusDropdown === account.account_id && (
                      <div ref={dropdownRef} className={`absolute left-4 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 min-w-[120px] ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        {ALL_STATUSES.map(s => (
                          <button
                            key={s}
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(account.account_id, s); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${s === account.status ? 'font-bold text-matera-blue' : 'text-slate-700'}`}
                          >
                            <Badge status={s}>{s}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{account.currency_code}</td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-slate-800">
                    {account.available_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-500">
                    {account.collected_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500">{new Date(account.created_at).toLocaleDateString()}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredAccounts.length} of {accounts.length} results</span>
        </div>
      </div>

      {/* New Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">New Account</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={form.account_number}
                  onChange={e => setForm({ ...form, account_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue"
                  placeholder="e.g. 1000000006"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product Type</label>
                  <select
                    value={form.product_type}
                    onChange={e => setForm({ ...form, product_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue bg-white"
                  >
                    {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                  <select
                    value={form.currency_code}
                    onChange={e => setForm({ ...form, currency_code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-matera-blue/20 focus:border-matera-blue bg-white"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
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

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                  {error}
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
                  disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-matera-blue rounded-lg hover:bg-matera-lightBlue transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Backend Error Modal */}
      {backendError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBackendError('')} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Operation Failed</h2>
                <div className="bg-slate-900 rounded-md p-3 font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-words">
                  {backendError}
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setBackendError('')}
                className="px-4 py-2 text-sm text-white bg-matera-blue rounded-lg hover:bg-matera-lightBlue transition-colors shadow-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Not Implemented Modal */}
      {showStub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowStub(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Ban size={24} className="text-slate-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Not Implemented</h2>
            <p className="text-sm text-slate-500 mb-6">This feature is not implemented — and will never be.</p>
            <button
              onClick={() => setShowStub(false)}
              className="px-4 py-2 text-sm text-white bg-matera-blue rounded-lg hover:bg-matera-lightBlue transition-colors shadow-sm"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
