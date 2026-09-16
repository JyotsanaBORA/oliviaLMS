import React from 'react';

const COLOR_MAP = {
  blue: {
    bg: 'bg-blue-50/70',
    border: 'border-blue-100',
    iconBg: 'bg-blue-100 text-blue-600',
    valueText: 'text-blue-900',
  },
  emerald: {
    bg: 'bg-emerald-50/70',
    border: 'border-emerald-100',
    iconBg: 'bg-emerald-100 text-emerald-600',
    valueText: 'text-emerald-900',
  },
  green: {
    bg: 'bg-green-50/70',
    border: 'border-green-100',
    iconBg: 'bg-green-100 text-green-600',
    valueText: 'text-green-900',
  },
  amber: {
    bg: 'bg-amber-50/70',
    border: 'border-amber-100',
    iconBg: 'bg-amber-100 text-amber-600',
    valueText: 'text-amber-900',
  },
  purple: {
    bg: 'bg-purple-50/70',
    border: 'border-purple-100',
    iconBg: 'bg-purple-100 text-purple-600',
    valueText: 'text-purple-900',
  },
  indigo: {
    bg: 'bg-indigo-50/70',
    border: 'border-indigo-100',
    iconBg: 'bg-indigo-100 text-indigo-600',
    valueText: 'text-indigo-900',
  },
  red: {
    bg: 'bg-red-50/70',
    border: 'border-red-100',
    iconBg: 'bg-red-100 text-red-600',
    valueText: 'text-red-900',
  },
  gray: {
    bg: 'bg-white',
    border: 'border-gray-200',
    iconBg: 'bg-gray-100 text-gray-600',
    valueText: 'text-gray-900',
  }
};

/**
 * Common reusable KPI StatCard component
 */
const StatCard = ({
  title,
  value,
  icon: Icon,
  color = 'gray',
  subtitle,
  trend,
  onClick,
  className = ''
}) => {
  const scheme = COLOR_MAP[color] || COLOR_MAP.gray;
  const isClickable = typeof onClick === 'function';

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-5 border transition-all duration-200 shadow-sm ${scheme.bg} ${scheme.border} ${
        isClickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-98' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{title}</p>
          <h4 className={`text-2xl font-bold tracking-tight ${scheme.valueText}`}>{value ?? '—'}</h4>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && <p className="text-xs font-medium text-emerald-600 mt-1">{trend}</p>}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl shadow-inner ${scheme.iconBg}`}>
            <Icon size={24} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
