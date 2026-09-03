import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import api from '../utils/axios';
import toast from 'react-hot-toast';

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const Input = ({ className = '', ...props }) => (
  <input
    className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${className}`}
    {...props}
  />
);

const EMPTY = {
  firstName: '', lastName: '', gender: '',
  phoneNumber: '', panNumber: '', dateOfBirth: '', pincode: '', address: '',
};

const mapScoreToRange = (scoreStr) => {
  const n = parseInt(scoreStr, 10);
  if (isNaN(n) || n <= 0) return 'unknown';
  if (n < 600) return 'below_600';
  if (n < 700) return '600_699';
  if (n < 750) return '700_749';
  if (n <= 800) return '750_800';
  return 'above_800';
};

const CibilCheckModal = ({ onClose }) => {
  const [form,     setForm]     = useState(EMPTY);
  const [checking, setChecking] = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState('');

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleCheck = async () => {
    const REQUIRED = ['firstName', 'lastName', 'gender', 'phoneNumber', 'panNumber', 'dateOfBirth', 'pincode', 'address'];
    const missing  = REQUIRED.filter(k => !form[k]?.trim());
    if (missing.length) { setError(`Please fill in: ${missing.join(', ')}`); return; }

    setChecking(true);
    setError('');
    try {
      const res            = await api.post('/domestic-api/cibil/check', form);
      const signzyResponse = res.data?.data;
      setResult(signzyResponse);
      const scores = signzyResponse?.data?.CIBILReport?.consumerCreditData?.[0]?.scores;
      if (scores?.length) {
        const score = parseInt(scores[0]?.score, 10);
        if (!isNaN(score)) toast.success(`CIBIL Score: ${score} (${mapScoreToRange(scores[0].score).replace(/_/g, ' ')})`);
      }
    } catch (err) {
      const data = err.response?.data;
      const raw = data?.message || data?.details?.error?.message || data?.details?.message || (typeof data?.details === 'string' ? data.details : null);
      setError(typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : (err.message || 'CIBIL check failed.'));
    } finally {
      setChecking(false);
    }
  };

  //  Result display 
  const renderResult = () => {
    const cibilData  = result?.data;
    const report     = cibilData?.CIBILReport;
    const creditData = report?.consumerCreditData?.[0];
    const scores     = creditData?.scores || [];
    const acctSumm   = report?.consumerSummaryData?.accountSummary || {};
    const inqSumm    = report?.consumerSummaryData?.inquirySummary  || {};
    const pdfUrl     = cibilData?.CIBILPDF;
    const scoreObj   = scores[0];
    const scoreVal   = scoreObj ? parseInt(scoreObj.score, 10) : null;
    const reportName = creditData?.names?.[0]?.name || '';

    const scoreBand = scoreVal === null ? null
      : scoreVal >= 800 ? { label: 'Excellent', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
      : scoreVal >= 750 ? { label: 'Very Good', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
      : scoreVal >= 700 ? { label: 'Good',      cls: 'bg-teal-100   text-teal-700   border-teal-200'    }
      : scoreVal >= 650 ? { label: 'Fair',       cls: 'bg-amber-100  text-amber-700  border-amber-200'   }
      :                   { label: 'Poor',       cls: 'bg-red-100    text-red-700    border-red-200'     };

    return (
      <div className="space-y-4">
        {/* Score banner */}
        <div className="flex items-center justify-between bg-indigo-50 border-2 border-indigo-200 rounded-2xl px-6 py-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">CIBIL Score</p>
            <p className={`text-5xl font-black mt-1 ${
              scoreVal === null ? 'text-gray-400'
                : scoreVal >= 700 ? 'text-emerald-600'
                : scoreVal >= 600 ? 'text-amber-600'
                : 'text-red-600'
            }`}>{scoreVal !== null ? scoreVal : ''}</p>
            {reportName && <p className="text-xs text-gray-400 mt-1">{reportName}</p>}
          </div>
          <div className="text-right space-y-2">
            {scoreBand && (
              <span className={`inline-block text-sm font-bold px-4 py-2 rounded-full border ${scoreBand.cls}`}>
                {scoreBand.label}
              </span>
            )}
            {scoreObj?.scoreName && <p className="text-xs text-gray-400">{scoreObj.scoreName}</p>}
          </div>
        </div>

        {/* Summary grid */}
        {(Object.keys(acctSumm).length > 0 || Object.keys(inqSumm).length > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Total Accounts',   val: acctSumm.totalAccounts },
              { label: 'Overdue Accounts', val: acctSumm.overdueAccounts,  warn: acctSumm.overdueAccounts > 0 },
              { label: 'Current Balance',  val: acctSumm.currentBalance  != null ? `${acctSumm.currentBalance.toLocaleString('en-IN')}` : null },
              { label: 'Overdue Balance',  val: acctSumm.overdueBalance  != null ? `${acctSumm.overdueBalance.toLocaleString('en-IN')}` : null, warn: acctSumm.overdueBalance > 0 },
              { label: 'Enquiries (30d)',  val: inqSumm.inquiryPast30Days },
              { label: 'Enquiries (12m)',  val: inqSumm.inquiryPast12Months },
              { label: 'Total Enquiries',  val: inqSumm.totalInquiry },
              { label: 'Oldest Account',   val: acctSumm.oldestDateOpened },
            ].filter(x => x.val != null).map(({ label, val, warn }) => (
              <div key={label} className={`rounded-xl p-3 border ${warn ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-red-700' : 'text-gray-700'}`}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors">
              <FileText className="h-4 w-4" /> Download PDF Report
            </a>
          )}
          <button type="button" onClick={() => { setResult(null); setError(''); setForm(EMPTY); }}
            className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl bg-white transition-colors">
            Check Another
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Live CIBIL Score Check</h2>
              <p className="text-indigo-200 text-xs mt-0.5">Powered by Signzy  real-time credit bureau check</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {!result ? (
            <>
              <p className="text-xs text-gray-500">Fill in the customer's details and click <strong>Run CIBIL Check</strong>.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="First Name" required>
                  <Input value={form.firstName} onChange={set('firstName')} placeholder="e.g. RAHUL KUMAR" />
                </Field>
                <Field label="Last Name" required>
                  <Input value={form.lastName} onChange={set('lastName')} placeholder="e.g. SHARMA" />
                </Field>
                <Field label="Gender" required>
                  <select value={form.gender} onChange={set('gender')}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Transgender">Transgender</option>
                  </select>
                </Field>
                <Field label="Mobile Number" required>
                  <Input value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="9876543210" />
                </Field>
                <Field label="PAN Number" required>
                  <Input value={form.panNumber} onChange={set('panNumber')} placeholder="ABCDE1234F"
                    style={{ textTransform: 'uppercase' }} />
                </Field>
                <Field label="Date of Birth" required>
                  <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
                </Field>
                <Field label="Pincode" required>
                  <Input value={form.pincode} onChange={set('pincode')} placeholder="400001" maxLength={6} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address" required>
                    <textarea value={form.address} onChange={set('address')} rows={2}
                      placeholder="Full residential address"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  </Field>
                </div>
              </div>

              {/* Consent notice */}
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-green-700">
                  By running this check you confirm the customer has given explicit written/verbal consent for a credit bureau inquiry.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </>
          ) : renderResult()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Close
          </button>
          {!result && (
            <button onClick={handleCheck} disabled={checking}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl transition-colors shadow-sm">
              {checking
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <ShieldCheck className="h-4 w-4" />}
              {checking ? 'Checking' : 'Run CIBIL Check'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CibilCheckModal;

