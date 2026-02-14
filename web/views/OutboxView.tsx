import React from 'react';
import { OutboxItem, OutboxStatus } from '../types';
import { Badge } from '../components/ui/Badge';
import { Code, Terminal, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface OutboxViewProps {
  items: OutboxItem[];
  title: string;
}

export const OutboxView: React.FC<OutboxViewProps> = ({ items, title }) => {
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
            Real-time event log for asynchronous {title.toLowerCase()} processing. 
            Events here are queued for downstream consumption by the data warehouse and notification services.
          </p>
          <div className="flex gap-6 mt-6">
             <div className="flex flex-col">
                <span className="text-3xl font-mono font-bold text-emerald-400">
                    {items.filter(i => i.status === OutboxStatus.SENT).length}
                </span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Processed</span>
             </div>
             <div className="flex flex-col">
                <span className="text-3xl font-mono font-bold text-amber-400">
                    {items.filter(i => i.status === OutboxStatus.PROCESSING || i.status === OutboxStatus.WAITING).length}
                </span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Pending</span>
             </div>
             <div className="flex flex-col">
                <span className="text-3xl font-mono font-bold text-rose-400">
                    {items.filter(i => i.status === OutboxStatus.FAILED).length}
                </span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Failed</span>
             </div>
          </div>
       </div>

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-lg border border-slate-200 hover:border-matera-blue/50 transition-all shadow-sm group">
            <div className="p-4 flex items-start justify-between">
              <div className="flex gap-4">
                 <div className={`mt-1 p-2 rounded-lg ${
                     item.status === OutboxStatus.SENT ? 'bg-emerald-50 text-emerald-600' :
                     item.status === OutboxStatus.FAILED ? 'bg-rose-50 text-rose-600' :
                     'bg-slate-100 text-slate-500'
                 }`}>
                    {item.status === OutboxStatus.SENT && <CheckCircle2 size={20} />}
                    {item.status === OutboxStatus.FAILED && <AlertCircle size={20} />}
                    {(item.status === OutboxStatus.WAITING || item.status === OutboxStatus.PROCESSING) && <Clock size={20} className={item.status === OutboxStatus.PROCESSING ? "animate-spin" : ""} />}
                 </div>
                 
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-800">{item.eventType}</span>
                        <span className="text-xs font-mono text-slate-400">{item.id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                        <span>Entity: <span className="font-mono text-slate-700">{item.entityId}</span></span>
                        <span>•</span>
                        <span>{new Date(item.createdAt).toISOString()}</span>
                        {item.retryCount > 0 && (
                             <span className="text-amber-600 font-medium">• Retry #{item.retryCount}</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                         <Badge status={item.status}>{item.status}</Badge>
                    </div>
                 </div>
              </div>
              
              <button className="text-xs font-medium text-matera-blue hover:text-matera-orange transition-colors opacity-0 group-hover:opacity-100">
                View Trace
              </button>
            </div>
            
            <div className="px-4 pb-4">
                <div className="bg-slate-900 rounded-md p-3 font-mono text-xs text-slate-300 overflow-x-auto">
                    <pre>{item.payload}</pre>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};