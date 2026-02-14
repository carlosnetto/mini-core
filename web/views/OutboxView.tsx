import React from 'react';
import { OutboxAccountEvent, OutboxTransactionEvent, SyncStatus } from '../types';
import { Badge } from '../components/ui/Badge';
import { Code, Terminal, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

type OutboxEvent = OutboxAccountEvent | OutboxTransactionEvent;

interface OutboxViewProps {
  items: OutboxEvent[];
  title: string;
  type: 'accounts' | 'transactions';
}

function isAccountEvent(item: OutboxEvent): item is OutboxAccountEvent {
  return 'snapshot_type' in item;
}

export const OutboxView: React.FC<OutboxViewProps> = ({ items, title, type }) => {
  const confirmedCount = items.filter(i => i.sync_status === SyncStatus.CONFIRMED).length;
  const waitingCount = items.filter(i => i.sync_status === SyncStatus.WAITING).length;
  const pendingCount = items.filter(i => i.sync_status === SyncStatus.PENDING).length;

  return (
    <div className="space-y-6">
       <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
              <Terminal size={100} />
          </div>
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Code size={20} className="text-matera-orange" />
            {title} Stream
          </h2>
          <p className="text-slate-400 text-sm max-w-2xl">
            Outbox events for {type}. Each row mirrors the source table columns at the time the event was captured.
          </p>
          <div className="flex gap-6 mt-6">
             <div className="flex flex-col">
                <span className="text-3xl font-mono font-bold text-emerald-400">{confirmedCount}</span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Confirmed</span>
             </div>
             <div className="flex flex-col">
                <span className="text-3xl font-mono font-bold text-blue-400">{waitingCount}</span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Waiting</span>
             </div>
             <div className="flex flex-col">
                <span className="text-3xl font-mono font-bold text-amber-400">{pendingCount}</span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Pending</span>
             </div>
          </div>
       </div>

      {/* Events Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Event ID</th>
                <th className="px-4 py-3">Sync</th>
                <th className="px-4 py-3">Op</th>
                {type === 'accounts' && <th className="px-4 py-3">Snap</th>}
                <th className="px-4 py-3">{type === 'accounts' ? 'Account ID' : 'Tx ID'}</th>
                {type === 'transactions' && <th className="px-4 py-3">Account</th>}
                <th className="px-4 py-3">Status</th>
                {type === 'accounts' && (
                  <>
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                  </>
                )}
                {type === 'transactions' && (
                  <>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Dir</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Orig Tx</th>
                  </>
                )}
                <th className="px-4 py-3">Event Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.event_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-slate-600">{item.event_id}</td>
                  <td className="px-4 py-3">
                    <Badge status={item.sync_status}>{item.sync_status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-500">{item.operation_type}</td>
                  {isAccountEvent(item) && (
                    <>
                      <td className="px-4 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.snapshot_type === 'POS' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.snapshot_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{item.account_id}</td>
                      <td className="px-4 py-3 text-slate-600">{item.status}</td>
                      <td className="px-4 py-3 text-slate-600">{item.account_number}</td>
                      <td className="px-4 py-3 text-slate-500">{item.product_type}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {item.available_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {item.collected_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </>
                  )}
                  {!isAccountEvent(item) && (
                    <>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{(item as OutboxTransactionEvent).transaction_id}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{item.account_id}</td>
                      <td className="px-4 py-3 text-slate-600">{(item as OutboxTransactionEvent).status}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{(item as OutboxTransactionEvent).transaction_code}</td>
                      <td className="px-4 py-3 text-slate-500">{(item as OutboxTransactionEvent).direction}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {(item as OutboxTransactionEvent).amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {(item as OutboxTransactionEvent).original_transaction_id ?? '—'}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(item.event_created_at).toLocaleString()}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                    No outbox events found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 text-xs text-slate-500">
          {items.length} events total
        </div>
      </div>
    </div>
  );
};
