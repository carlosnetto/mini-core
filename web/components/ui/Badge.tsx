import React from 'react';
import { AccountStatus, TransactionStatus, TransactionDirection, SyncStatus } from '../../types';

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
  if (status === TransactionStatus.PENDING) colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === TransactionStatus.POSTED) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === TransactionStatus.CANCELLED) colorClass = 'bg-rose-50 text-rose-700 border-rose-200';

  // Transaction Direction Colors
  if (status === TransactionDirection.CREDIT) colorClass = 'bg-green-50 text-green-700 border-green-200';
  if (status === TransactionDirection.DEBIT) colorClass = 'bg-red-50 text-red-700 border-red-200';

  // Sync Status Colors
  if (status === SyncStatus.CONFIRMED) colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === SyncStatus.WAITING) colorClass = 'bg-blue-100 text-blue-800 border-blue-200';
  if (status === SyncStatus.PENDING) colorClass = 'bg-amber-100 text-amber-800 border-amber-200';

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass} ${className}`}>
      {children}
    </span>
  );
};
