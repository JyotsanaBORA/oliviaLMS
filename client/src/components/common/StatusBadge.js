import React from 'react';

const STATUS_THEMES = {
  // Common states
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  reviewed: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  imported: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  converted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  inactive: 'bg-gray-100 text-gray-700 border-gray-200',
  dispositioned: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  received: 'bg-blue-100 text-blue-800 border-blue-200',
  cleared: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  nsf: 'bg-purple-100 text-purple-800 border-purple-200',
  cancellation: 'bg-rose-100 text-rose-800 border-rose-200',
  refunded: 'bg-red-100 text-red-800 border-red-200',
  qualified: 'bg-green-100 text-green-800 border-green-200',
  'not-qualified': 'bg-red-100 text-red-800 border-red-200',
  disqualified: 'bg-red-100 text-red-800 border-red-200',
  unqualified: 'bg-red-100 text-red-800 border-red-200',
  sale: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'callback needed': 'bg-amber-100 text-amber-800 border-amber-200',
  'existing client': 'bg-blue-100 text-blue-800 border-blue-200',
  'unacceptable creditors': 'bg-red-100 text-red-800 border-red-200',
  'not serviceable state': 'bg-orange-100 text-orange-800 border-orange-200',
  'sale long play': 'bg-teal-100 text-teal-800 border-teal-200',
  'request for loan': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'do not call - litigator': 'bg-rose-100 text-rose-800 border-rose-200',
  'do not call': 'bg-rose-100 text-rose-800 border-rose-200',
  'hang-up': 'bg-gray-100 text-gray-700 border-gray-200',
  'not interested': 'bg-red-100 text-red-800 border-red-200',
  'no answer': 'bg-amber-100 text-amber-800 border-amber-200',
  'aip client': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  affordability: 'bg-yellow-100 text-yellow-800 border-yellow-200',
};

/**
 * Common reusable StatusBadge component
 */
const StatusBadge = ({ status, label, className = '' }) => {
  const key = String(status || '').trim().toLowerCase();
  const theme = STATUS_THEMES[key] || 'bg-gray-100 text-gray-700 border-gray-200';
  const text = label || status || '—';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${theme} ${className}`}
    >
      {text}
    </span>
  );
};

export default StatusBadge;
