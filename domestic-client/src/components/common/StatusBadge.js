import React from 'react';

const STATUS_THEMES = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  contacted: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  interested: 'bg-purple-100 text-purple-800 border-purple-200',
  qualified: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  converted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  'not interested': 'bg-gray-100 text-gray-700 border-gray-200',
  callback: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

/**
 * Common reusable StatusBadge component for Domestic Client
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
