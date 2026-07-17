import React, { useState } from 'react';
import { X, Phone, Mail, MapPin, Briefcase, CreditCard, BarChart2, User, ChevronRight, Edit3 } from 'lucide-react';

const WORK_STATUS_META = {
  new:            { label: 'Not Called Yet', cls: 'bg-orange-100 text-orange-700 border border-orange-200' },
  in_progress:    { label: 'In Progress',    cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700 border border-red-200' },
  closed:         { label: 'Closed',         cls: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

const Field = ({ label, value, highlight }) => {
  if (!value) return null;
  return (
    <div className={`flex flex-col gap-0.5 p-3 rounded-xl ${highlight ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-amber-800 text-base' : 'text-gray-800'}`}>{value}</span>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title, color }) => (
  <div className={`flex items-center gap-2 px-4 py-2.5 ${color} border-b`}>
    <Icon className="h-4 w-4 flex-shrink-0" />
    <span className="text-sm font-bold">{title}</span>
  </div>
);

/**
 * ImportedLeadDetailModal
 * Shows all data from an imported (pool) lead in a structured, readable format.
 * Has a "Work This Lead" button that calls onWorkLead(lead) to open the full form.
 */
const ImportedLeadDetailModal = ({ lead, onClose, onWorkLead }) => {
  const [tab, setTab] = useState('customer');

  const ws     = WORK_STATUS_META[lead.workStatus || 'new'] || WORK_STATUS_META.new;
  const loanId = lead.loanType || lead.productType || '—';

  const tabs = [
    { key: 'customer',  label: 'Customer',   Icon: User },
    { key: 'loan',      label: 'Loan',        Icon: CreditCard },
    { key: 'financial', label: 'Financial',   Icon: BarChart2 },
    { key: 'address',   label: 'Address',     Icon: MapPin },
    { key: 'work',      label: 'Work Status', Icon: Edit3 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 bg-gradient-to-r from-violet-600 to-purple-700 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-white font-black text-lg leading-tight">{lead.name || '—'}</h2>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${ws.cls}`}>
                {ws.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              {lead.mobile && (
                <span className="text-violet-200 text-sm font-mono flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {lead.mobile}
                </span>
              )}
              {lead.loanType && (
                <span className="text-violet-200 text-sm capitalize flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> {loanId}
                </span>
              )}
              {lead.state && (
                <span className="text-violet-200 text-sm flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {lead.state}
                </span>
              )}
            </div>
            {/* Key financial highlights */}
            {(lead.totalOutstandingAmount || lead.principalOutstanding) && (
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {lead.totalOutstandingAmount && (
                  <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2.5 py-1 rounded-lg">
                    Total Outstanding: ₹{lead.totalOutstandingAmount}
                  </span>
                )}
                {lead.principalOutstanding && (
                  <span className="bg-orange-400 text-orange-900 text-xs font-bold px-2.5 py-1 rounded-lg">
                    Principal: ₹{lead.principalOutstanding}
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white mt-0.5 flex-shrink-0 ml-4">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex border-b border-gray-100 bg-gray-50 overflow-x-auto flex-shrink-0">
          {tabs.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                tab === key
                  ? 'border-violet-600 text-violet-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white'
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* CUSTOMER tab */}
          {tab === 'customer' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer Name"       value={lead.name} />
                <Field label="Mobile Number"       value={lead.mobile} />
                <Field label="E Mail"              value={lead.email} />
                <Field label="Date of Birth"       value={lead.dateOfBirth} />
                <Field label="Age"                 value={lead.age} />
                <Field label="PAN Number"          value={lead.panNumber} />
                <Field label="Aadhar No"           value={lead.customerAadharNo} />
                <Field label="Preferred Language"  value={lead.customerPreferredLanguage} />
                <Field label="Employment Type"     value={lead.employment} />
                <Field label="Firm / Employee Name" value={lead.firmEmployeeName} />
              </div>
            </div>
          )}

          {/* LOAN tab */}
          {tab === 'loan' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vintage"                 value={lead.vintage} />
                <Field label="Loan Type"               value={lead.loanType || lead.productType} />
                <Field label="Expiry Status"           value={lead.expiryStatus} />
                <Field label="Expiry Date"             value={lead.expiryDate} />
                <Field label="No. of Installments Overdue" value={lead.noOfInstallmentOverdue} highlight={!!lead.noOfInstallmentOverdue && parseInt(lead.noOfInstallmentOverdue) > 0} />
                <Field label="Count of Live Loans"    value={lead.countOfLiveLoans} />
                <Field label="Sanction Date"          value={lead.sanctionDate} />
                <Field label="Bank Name"              value={lead.bankName} />
              </div>
            </div>
          )}

          {/* FINANCIAL tab */}
          {tab === 'financial' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount Financed"          value={lead.amountFinanced ? `₹${lead.amountFinanced}` : ''} />
                <Field label="Total Outstanding Amount" value={lead.totalOutstandingAmount ? `₹${lead.totalOutstandingAmount}` : ''} highlight />
                <Field label="Principal Outstanding"    value={lead.principalOutstanding ? `₹${lead.principalOutstanding}` : ''} highlight />
                <Field label="Disbursal Amount"         value={lead.disbursalAmount ? `₹${lead.disbursalAmount}` : ''} />
                <Field label="CIBIL Score"              value={lead.cibilScore} />
                <Field label="CIBIL Score Date"         value={lead.cibilScoreDate} />
                <Field label="Property Value (Latest)"  value={lead.propertyValueLatest ? `₹${lead.propertyValueLatest}` : ''} />
                <Field label="Asset Description"        value={lead.assetDescription} />
                <Field label="Make"                     value={lead.make} />
              </div>
            </div>
          )}

          {/* ADDRESS tab */}
          {tab === 'address' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <Field label="Residence Address"      value={lead.residenceAddress} />
                <Field label="Residence Phone Number" value={lead.residencePhoneNumber} />
                <Field label="Office Address"         value={lead.officeAddress} />
                <Field label="Office Phone Number"    value={lead.officePhoneNumber} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City"     value={lead.city} />
                <Field label="State"    value={lead.state} />
                <Field label="Zip Code" value={lead.zipCode} />
              </div>
            </div>
          )}

          {/* WORK STATUS tab */}
          {tab === 'work' && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-4 rounded-2xl ${ws.cls}`}>
                <div className="text-3xl">
                  {lead.workStatus === 'interested' ? '👍' :
                   lead.workStatus === 'not_interested' ? '👎' :
                   lead.workStatus === 'in_progress' ? '📞' :
                   lead.workStatus === 'closed' ? '🔒' : '📋'}
                </div>
                <div>
                  <p className="font-bold text-base">{ws.label}</p>
                  {lead.callOutcome && <p className="text-sm mt-0.5 capitalize">{lead.callOutcome.replace(/_/g,' ')}</p>}
                  {lead.workedAt && <p className="text-xs mt-0.5 opacity-70">Last worked: {new Date(lead.workedAt).toLocaleString('en-IN')}</p>}
                </div>
              </div>
              {lead.agentNotes && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-gray-700">{lead.agentNotes}</p>
                </div>
              )}
              {lead.callbackDate && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-xs text-blue-500 font-bold uppercase tracking-wide mb-0.5">Callback Date</p>
                  <p className="text-sm font-semibold text-blue-800">{lead.callbackDate}</p>
                </div>
              )}
              {!lead.domLeadId && (
                <p className="text-xs text-gray-400 text-center">No detailed form submitted yet</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-100 font-medium text-gray-600 transition-colors">
            Close
          </button>
          <button onClick={() => onWorkLead(lead)}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 text-white text-sm font-bold rounded-xl hover:from-violet-700 hover:to-purple-800 shadow-md shadow-violet-200 transition-all">
            {lead.domLeadId ? '✏️ Edit Work Form' : '📞 Work This Lead'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportedLeadDetailModal;
