import React from 'react';
import { Logo } from './Logo';
import { LayoutGrid, ArrowRightLeft, UploadCloud, Activity, Bell } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  outboxAcctsCount?: number;
  outboxTransCount?: number;
}

const NavItem = ({ id, label, icon: Icon, active, onClick, count }: any) => (
  <button
    onClick={() => onClick(id)}
    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 w-full rounded-lg mb-1 group
      ${active 
        ? 'bg-matera-blue text-white shadow-md' 
        : 'text-slate-600 hover:bg-slate-100 hover:text-matera-blue'
      }`}
  >
    <Icon size={18} className={active ? 'text-matera-orange' : 'text-slate-400 group-hover:text-matera-blue'} />
    <span className="flex-1 text-left">{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
        active 
          ? 'bg-matera-orange text-white' 
          : 'bg-slate-200 text-slate-600 group-hover:bg-matera-blue/10 group-hover:text-matera-blue'
      }`}>
        {count}
      </span>
    )}
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange,
  outboxAcctsCount = 0,
  outboxTransCount = 0
}) => {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <Logo />
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="mb-6">
            <h3 className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Core Ledger</h3>
            <NavItem 
              id="accounts" 
              label="Accounts" 
              icon={LayoutGrid} 
              active={activeTab === 'accounts'} 
              onClick={onTabChange} 
            />
            <NavItem 
              id="transactions" 
              label="Transactions" 
              icon={ArrowRightLeft} 
              active={activeTab === 'transactions'} 
              onClick={onTabChange} 
            />
          </div>

          <div>
            <h3 className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Integration</h3>
            <NavItem 
              id="outbox-accts" 
              label="Outbox: Accounts" 
              icon={UploadCloud} 
              active={activeTab === 'outbox-accts'} 
              onClick={onTabChange} 
              count={outboxAcctsCount}
            />
            <NavItem 
              id="outbox-trans" 
              label="Outbox: Transactions" 
              icon={Activity} 
              active={activeTab === 'outbox-trans'} 
              onClick={onTabChange} 
              count={outboxTransCount}
            />
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-medium text-slate-600">System Healthy</span>
            </div>
            <p className="text-[10px] text-slate-400">Version 2.4.0-stable</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 shadow-sm z-10">
          <h1 className="text-xl font-bold text-slate-800 capitalize">
            {activeTab.replace('-', ' ')}
          </h1>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:text-matera-blue transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
            </button>
            <div className="h-8 w-8 rounded-full bg-matera-blue text-white flex items-center justify-center font-bold text-sm">
              AD
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto bg-slate-50 p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};