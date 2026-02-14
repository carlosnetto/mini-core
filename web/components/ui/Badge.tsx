import React from 'react';
import { AccountStatus, TransactionStatus, OutboxStatus, TransactionType } from '../../types';

interface BadgeProps {
  status?: string;
  type?: 'status' | 'type';
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ status, type = 'status', children, className = '' }) => {
  let colorClass = 'bg-gray-100 text-gray-800';

  // Account Status Colors
  if (status === AccountStatus.ACTIVE) colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === AccountStatus.FROZEN) colorClass = 'bg-blue-100 text-blue-800 border-blue-200';
  if (status === AccountStatus.CLOSED) colorClass = 'bg-gray-100 text-gray-600 border-gray-200';
  if (status === AccountStatus.DORMANT) colorClass = 'bg-amber-100 text-amber-800 border-amber-200';

  // Transaction Status Colors
  if (status === TransactionStatus.COMPLETED) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === TransactionStatus.PENDING) colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === TransactionStatus.FAILED) colorClass = 'bg-rose-50 text-rose-700 border-rose-200';

  // Transaction Type Colors
  if (status === TransactionType.CREDIT) colorClass = 'bg-green-50 text-green-700 border-green-200';
  if (status === TransactionType.DEBIT) colorClass = 'bg-red-50 text-red-700 border-red-200';
  if (status === TransactionType.TRANSFER) colorClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';

  // Outbox Status Colors
  if (status === OutboxStatus.SENT) colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === OutboxStatus.PROCESSING) colorClass = 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
  if (status === OutboxStatus.WAITING) colorClass = 'bg-slate-100 text-slate-800 border-slate-200';
  if (status === OutboxStatus.FAILED) colorClass = 'bg-rose-100 text-rose-800 border-rose-200';

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass} ${className}`}>
      {children}
    </span>
  );
};