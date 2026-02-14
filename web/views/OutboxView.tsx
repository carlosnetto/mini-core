import React, { useState } from 'react';
import { OutboxAccountEvent, OutboxTransactionEvent, OutboxTransactionEventDetail, OutboxAccountEventDetail, SyncStatus } from '../types';
import { Badge } from '../components/ui/Badge';
import { fetchOutboxTransactionDetail, fetchOutboxAccountDetail } from '../services/api';
import { Code, Terminal, X, Clock, ArrowRight } from 'lucide-react';

type OutboxEvent = OutboxAccountEvent | OutboxTransactionEvent;
type OutboxEventDetail = OutboxTransactionEventDetail | OutboxAccountEventDetail;

interface OutboxViewProps {
  items: OutboxEvent[];
  title: string;
  type: 'accounts' | 'transactions';
}

function isAccountEvent(item: OutboxEvent): item is OutboxAccountEvent {
  return 'snapshot_type' in item;
}

function isAccountDetail(detail: OutboxEventDetail): detail is OutboxAccountEventDetail {
  return 'snapshot_type' in detail;
}

function isTransactionDetail(detail: OutboxEventDetail): detail is OutboxTransactionEventDetail {
  return 'transaction_id' in detail;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs text-slate-800 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</h4>
      <div className="bg-slate-50 rounded-lg px-3 py-2">{children}</div>
    </div>
  );
}

export const OutboxView: React.FC<OutboxViewProps> = ({ items, title, type }) => {
  const confirmedCount = items.filter(i => i.sync_status === SyncStatus.CONFIRMED).length;
  const waitingCount = items.filter(i => i.sync_status === SyncStatus.WAITING).length;
  const pendingCount = items.filter(i => i.sync_status === SyncStatus.PENDING).length;

  const [selectedDetail, setSelectedDetail] = useState<OutboxEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const handleEventClick = async (eventId: number) => {
    setDetailLoading(true);
    setDetailError('');
    setSelectedDetail(null);
    try {
      const detail = type === 'transactions'
        ? await fetchOutboxTransactionDetail(eventId)
        : await fetchOutboxAccountDetail(eventId);
      setSelectedDetail(detail);
    } catch (err: any) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedDetail(null);
    setDetailError('');
    setDetailLoading(false);
  };

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
                  <td className="px-4 py-3 font-mono">
                    <button
                      onClick={() => handleEventClick(item.event_id)}
                      className="text-matera-blue hover:text-matera-lightBlue underline decoration-matera-blue/30 hover:decoration-matera-lightBlue cursor-pointer"
                    >
                      {item.event_id}
                    </button>
                  </td>
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

      {/* Event Detail Modal */}
      {(detailLoading || detailError || selectedDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800">
                  Event #{selectedDetail?.event_id ?? '...'}
                </h2>
                {selectedDetail && (
                  <Badge status={selectedDetail.sync_status}>{selectedDetail.sync_status}</Badge>
                )}
              </div>
              <button onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto">
              {detailLoading && (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                  Loading event details...
                </div>
              )}

              {detailError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                  {detailError}
                </div>
              )}

              {selectedDetail && isTransactionDetail(selectedDetail) && (
                <>
                  <Section title="Transaction Details">
                    <DetailRow label="Transaction ID" value={selectedDetail.transaction_id} mono />
                    <DetailRow label="Account ID" value={selectedDetail.account_id} mono />
                    <DetailRow label="Transaction Code" value={`${selectedDetail.transaction_code} — ${selectedDetail.transaction_description}`} />
                    <DetailRow label="Amount" value={selectedDetail.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} mono />
                    <DetailRow label="Direction" value={<Badge status={selectedDetail.direction}>{selectedDetail.direction}</Badge>} />
                    <DetailRow label="Status" value={<Badge status={selectedDetail.status}>{selectedDetail.status}</Badge>} />
                    <DetailRow label="Effective Date" value={selectedDetail.effective_date} />
                    {selectedDetail.original_transaction_id && (
                      <DetailRow label="Original Tx ID" value={selectedDetail.original_transaction_id} mono />
                    )}
                    <DetailRow label="Operation" value={selectedDetail.operation_type} />
                    {selectedDetail.created_by && (
                      <DetailRow label="Created By" value={selectedDetail.created_by} />
                    )}
                  </Section>

                  <Section title="Sync Timeline">
                    <div className="space-y-2 py-1">
                      <TimelineStep label="Transaction Created" time={selectedDetail.created_at} />
                      <TimelineStep label="Event Captured" time={selectedDetail.event_created_at} />
                      {selectedDetail.bulk_created_at && (
                        <TimelineStep label="Bulk Created" time={selectedDetail.bulk_created_at} />
                      )}
                      {selectedDetail.bulk_sent_at && (
                        <TimelineStep label="Bulk Sent" time={selectedDetail.bulk_sent_at} />
                      )}
                      {selectedDetail.confirmation_created_at && (
                        <TimelineStep label="Confirmation Received" time={selectedDetail.confirmation_created_at} active />
                      )}
                    </div>
                  </Section>

                  {selectedDetail.bulk_id && (
                    <Section title="Bulk Information">
                      <DetailRow label="Bulk ID" value={selectedDetail.bulk_id} mono />
                      <DetailRow label="Bulk Status" value={<Badge status={selectedDetail.bulk_status ?? undefined}>{selectedDetail.bulk_status}</Badge>} />
                      {selectedDetail.bulk_sent_at && (
                        <DetailRow label="Sent At" value={formatTimestamp(selectedDetail.bulk_sent_at)} />
                      )}
                      {selectedDetail.bulk_confirmed_at && (
                        <DetailRow label="Confirmed At" value={formatTimestamp(selectedDetail.bulk_confirmed_at)} />
                      )}
                    </Section>
                  )}

                  {selectedDetail.dtw_transaction_id && (
                    <Section title="Digital Twin Mapping">
                      <DetailRow label="DTW Transaction ID" value={selectedDetail.dtw_transaction_id} mono />
                      <DetailRow label="DTW Sync Status" value={selectedDetail.dtw_sync_status} />
                    </Section>
                  )}

                  {selectedDetail.dtw_confirmation && (
                    <Section title="Confirmation">
                      <DetailRow label="DTW Confirmation" value={selectedDetail.dtw_confirmation} mono />
                      <DetailRow label="Confirmed At" value={formatTimestamp(selectedDetail.confirmation_created_at)} />
                    </Section>
                  )}

                  {selectedDetail.json_payload && (
                    <Section title="JSON Payload">
                      <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-words overflow-x-auto">
                        {typeof selectedDetail.json_payload === 'string'
                          ? JSON.stringify(JSON.parse(selectedDetail.json_payload), null, 2)
                          : JSON.stringify(selectedDetail.json_payload, null, 2)}
                      </pre>
                    </Section>
                  )}
                </>
              )}

              {selectedDetail && isAccountDetail(selectedDetail) && (
                <>
                  <Section title="Account Details">
                    <DetailRow label="Account ID" value={selectedDetail.account_id} mono />
                    <DetailRow label="Account Number" value={selectedDetail.account_number} mono />
                    <DetailRow label="Product Type" value={selectedDetail.product_type} />
                    <DetailRow label="Status" value={<Badge status={selectedDetail.status}>{selectedDetail.status}</Badge>} />
                    <DetailRow label="Currency" value={selectedDetail.currency_code} />
                    <DetailRow label="Available Balance" value={selectedDetail.available_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} mono />
                    <DetailRow label="Collected Balance" value={selectedDetail.collected_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} mono />
                    <DetailRow label="Operation" value={selectedDetail.operation_type} />
                    <DetailRow label="Snapshot Type" value={
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        selectedDetail.snapshot_type === 'POS' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {selectedDetail.snapshot_type}
                      </span>
                    } />
                    {selectedDetail.created_by && (
                      <DetailRow label="Created By" value={selectedDetail.created_by} />
                    )}
                  </Section>

                  <Section title="Sync Timeline">
                    <div className="space-y-2 py-1">
                      <TimelineStep label="Account Updated" time={selectedDetail.updated_at} />
                      <TimelineStep label="Event Captured" time={selectedDetail.event_created_at} />
                      {selectedDetail.bulk_created_at && (
                        <TimelineStep label="Bulk Created" time={selectedDetail.bulk_created_at} />
                      )}
                      {selectedDetail.bulk_sent_at && (
                        <TimelineStep label="Bulk Sent" time={selectedDetail.bulk_sent_at} />
                      )}
                      {selectedDetail.confirmation_created_at && (
                        <TimelineStep label="Confirmation Received" time={selectedDetail.confirmation_created_at} active />
                      )}
                    </div>
                  </Section>

                  {selectedDetail.bulk_id && (
                    <Section title="Bulk Information">
                      <DetailRow label="Bulk ID" value={selectedDetail.bulk_id} mono />
                      <DetailRow label="Bulk Status" value={<Badge status={selectedDetail.bulk_status ?? undefined}>{selectedDetail.bulk_status}</Badge>} />
                      {selectedDetail.bulk_sent_at && (
                        <DetailRow label="Sent At" value={formatTimestamp(selectedDetail.bulk_sent_at)} />
                      )}
                      {selectedDetail.bulk_confirmed_at && (
                        <DetailRow label="Confirmed At" value={formatTimestamp(selectedDetail.bulk_confirmed_at)} />
                      )}
                    </Section>
                  )}

                  {selectedDetail.dtw_confirmation && (
                    <Section title="Confirmation">
                      <DetailRow label="DTW Confirmation" value={selectedDetail.dtw_confirmation} mono />
                      <DetailRow label="Confirmed At" value={formatTimestamp(selectedDetail.confirmation_created_at)} />
                    </Section>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-white bg-matera-blue rounded-lg hover:bg-matera-lightBlue transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function TimelineStep({ label, time, active }: { label: string; time: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <span className="text-xs text-slate-600 min-w-[140px]">{label}</span>
      <ArrowRight size={10} className="text-slate-300 shrink-0" />
      <span className="text-xs font-mono text-slate-500">{formatTimestamp(time)}</span>
    </div>
  );
}
