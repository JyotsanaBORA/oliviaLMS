import React from 'react';
import { Sliders, PhoneCall, Zap, LayoutGrid, Database, Download } from 'lucide-react';

const FEATURE_ITEMS = [
  {
    key: 'hasLiveTransfer',
    title: 'Live Transfer Channel',
    desc: 'Enables dedicated Live Transfer DID and classifies matching calls as live-transfer.',
    icon: Zap,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  {
    key: 'hasInboundCalls',
    title: 'Inbound Call Channel',
    desc: 'Enables dedicated Inbound Calls DID and classifies matching calls as inbound-call.',
    icon: PhoneCall,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  {
    key: 'hasDualDidSwitcher',
    title: 'Dual-DID Segregated Dashboard Switcher',
    desc: 'Displays the sliding Dual-DID bar (All Calls / Live Transfers / Inbound Calls) on the dashboard.',
    icon: LayoutGrid,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  {
    key: 'hasVendorLeadPortal',
    title: 'Dedicated Vendor Leads Portal',
    desc: 'Enables dedicated real-time leads portal modal (like Jake/TruClick) and mirrors inbound data.',
    icon: Sliders,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    key: 'hasOutboundData',
    title: 'Outbound / Vendor Data Tab',
    desc: 'Allows organisation admins to access the Outbound Data / Vendor Dashboard in the sidebar navigation.',
    icon: Database,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  {
    key: 'canDownloadCsv',
    title: 'Allow CSV Lead Export',
    desc: 'Permits organisation admin users to export and download lead reports as CSV.',
    icon: Download,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
];

/**
 * Reusable Organization Feature Flags Configuration Section.
 *
 * @param {Object} props
 * @param {Object} props.features - Current features state object
 * @param {Function} props.onChange - Callback (updatedFeatures) => void
 */
const OrgFeaturesConfig = ({ features = {}, onChange }) => {
  const handleToggle = (key) => {
    const updated = {
      ...features,
      [key]: !features[key]
    };
    onChange(updated);
  };

  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
          <Sliders className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Dashboard & Feature Permissions
          </h4>
          <p className="text-xs text-slate-500">
            Toggle features for this organisation. Changes take effect on the dashboard without code edits.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
        {FEATURE_ITEMS.map(({ key, title, desc, icon: Icon, color, bg, border }) => {
          const isChecked = Boolean(features[key]);
          return (
            <label
              key={key}
              onClick={() => handleToggle(key)}
              className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all duration-150 cursor-pointer select-none ${
                isChecked
                  ? `${bg} ${border} shadow-sm ring-1 ring-blue-500/20`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => {}} // handled by parent label onClick
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  <span className="text-xs font-semibold text-gray-900 leading-tight">
                    {title}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  {desc}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default OrgFeaturesConfig;
