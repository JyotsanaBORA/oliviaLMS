import React, { useState, useEffect } from 'react';
import { X, Save, User, Briefcase, CreditCard, FileText, MessageSquare } from 'lucide-react';
import api from '../utils/axios';
import toast from 'react-hot-toast';
import DocumentUpload from './DocumentUpload';

const TABS = [
  { key: 'personal',   label: 'Personal',    icon: User },
  { key: 'employment', label: 'Employment',  icon: Briefcase },
  { key: 'loan',       label: 'Loan',        icon: CreditCard },
  { key: 'credit',     label: 'Credit',      icon: FileText },
  { key: 'documents',  label: 'Documents',   icon: FileText },
  { key: 'disposition',label: 'Disposition', icon: MessageSquare },
];

const EMPTY_FORM = {
  name: '', dob: '', pan: '', aadhaar: '',
  mobile: '', alternateMobile: '', email: '', address: '', city: '', state: '', pincode: '',
  employmentType: '', companyName: '', monthlySalary: '',
  productType: '', loanAmountRequired: '',
  existingBank: '', salaryAccountBank: '',
  cibilScoreRange: '', existingLoans: '', existingEMI: '',
  callOutcome: '', callbackDate: '', notes: '',
};

const Field = ({ label, children, required }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const Input = ({ className = '', ...props }) => (
  <input
    className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
    {...props}
  />
);

const Select = ({ children, className = '', ...props }) => (
  <select
    className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${className}`}
    {...props}
  >
    {children}
  </select>
);

const LeadFormModal = ({ websiteLead, existingDomLead, onClose, onSaved }) => {
  const [activeTab, setActiveTab] = useState('personal');
  const [form, setForm]           = useState(EMPTY_FORM);
  const [documents, setDocuments] = useState([]);
  const [domLeadId, setDomLeadId] = useState(null);
  const [leadRef,   setLeadRef]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const isEdit = !!domLeadId;

  // Pre-fill from website lead data and existing DomLead
  useEffect(() => {
    if (existingDomLead) {
      setDomLeadId(existingDomLead._id);
      setLeadRef(existingDomLead.leadRef || null);
      setDocuments(existingDomLead.documents || []);
      setForm({
        name:               existingDomLead.name         || websiteLead?.name         || '',
        dob:                existingDomLead.dob           || '',
        pan:                existingDomLead.pan           || websiteLead?.pan          || '',
        aadhaar:            existingDomLead.aadhaar       || '',
        mobile:             existingDomLead.mobile        || websiteLead?.mobile       || '',
        alternateMobile:    existingDomLead.alternateMobile || '',
        email:              existingDomLead.email         || '',
        address:            existingDomLead.address       || '',
        city:               existingDomLead.city          || websiteLead?.city         || '',
        state:              existingDomLead.state         || '',
        pincode:            existingDomLead.pincode       || '',
        employmentType:     existingDomLead.employmentType || websiteLead?.employment   || '',
        companyName:        existingDomLead.companyName   || '',
        monthlySalary:      existingDomLead.monthlySalary || '',
        productType:        existingDomLead.productType   || websiteLead?.productType  || '',
        loanAmountRequired: existingDomLead.loanAmountRequired || '',
        existingBank:       existingDomLead.existingBank  || '',
        salaryAccountBank:  existingDomLead.salaryAccountBank || '',
        cibilScoreRange:    existingDomLead.cibilScoreRange || '',
        existingLoans:      (existingDomLead.existingLoans || []).join(', '),
        existingEMI:        existingDomLead.existingEMI   || '',
        callOutcome:        existingDomLead.callOutcome   || '',
        callbackDate:       existingDomLead.callbackDate  || '',
        notes:              existingDomLead.notes         || '',
      });
    } else if (websiteLead) {
      setForm((prev) => ({
        ...prev,
        name:           websiteLead.name        || '',
        mobile:         websiteLead.mobile       || '',
        city:           websiteLead.city         || '',
        pan:            websiteLead.pan          || '',
        employmentType: websiteLead.employment   || '',
        productType:    websiteLead.productType  || '',
      }));
    }
  }, [websiteLead, existingDomLead]);

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile) {
      toast.error('Name and mobile are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        existingLoans: form.existingLoans
          ? form.existingLoans.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        monthlySalary:      form.monthlySalary      ? Number(form.monthlySalary)      : undefined,
        loanAmountRequired: form.loanAmountRequired ? Number(form.loanAmountRequired) : undefined,
        existingEMI:        form.existingEMI        ? Number(form.existingEMI)        : undefined,
      };

      if (isEdit) {
        const res = await api.patch(`/domestic-api/leads/${domLeadId}`, payload);
        setLeadRef(res.data?.data?.leadRef || leadRef);
        toast.success('Lead updated successfully!');
      } else {
        const body = { ...payload };
        if (websiteLead?._id) body.sourceWebsiteLead = websiteLead._id;
        const res = await api.post('/domestic-api/leads', body);
        setDomLeadId(res.data.data._id);
        setLeadRef(res.data.data.leadRef || null);
        toast.success('Lead submitted! Card is now Blue.');
      }
      onSaved && onSaved();
    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentChange = (newDoc) => {
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.docType === newDoc.docType);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = newDoc;
        return next;
      }
      return [...prev, newDoc];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 bg-gradient-to-r from-blue-700 to-blue-900 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white">
                {isEdit ? 'Edit Lead' : websiteLead ? 'Work on Lead' : 'New Manual Lead'}
              </h2>
              {leadRef && (
                <span className="font-mono text-xs font-bold bg-white/20 text-green-300 border border-green-400/40 px-2 py-0.5 rounded tracking-widest">
                  {leadRef}
                </span>
              )}
            </div>
            <p className="text-blue-200 text-sm mt-0.5">
              {websiteLead
                ? `${websiteLead.name} · ${websiteLead.mobile} · ${websiteLead.productType}`
                : isEdit ? `${form.name} · ${form.mobile}` : 'Enter customer details manually'}
            </p>
          </div>
          <button onClick={onClose} className="text-white hover:text-blue-200 transition-colors mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto flex-shrink-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
                activeTab === key
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-6">
            {/* ── PERSONAL ──────────────────────────────────────────────── */}
            {activeTab === 'personal' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name" required>
                  <Input value={form.name} onChange={set('name')} placeholder="e.g. Rohan Sharma" />
                </Field>
                <Field label="Date of Birth">
                  <Input type="date" value={form.dob} onChange={set('dob')} />
                </Field>
                <Field label="PAN Number">
                  <Input value={form.pan} onChange={set('pan')} placeholder="ABCDE1234F" maxLength={10}
                    style={{ textTransform: 'uppercase' }} />
                </Field>
                <Field label="Aadhaar (last 4 digits)">
                  <Input value={form.aadhaar} onChange={set('aadhaar')} placeholder="XXXX" maxLength={12} />
                </Field>
                <Field label="Mobile" required>
                  <Input value={form.mobile} onChange={set('mobile')} placeholder="+91 9XXXXXXXXX" />
                </Field>
                <Field label="Alternate Mobile">
                  <Input value={form.alternateMobile} onChange={set('alternateMobile')} placeholder="+91 9XXXXXXXXX" />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={set('email')} placeholder="rohan@example.com" />
                </Field>
                <Field label="City">
                  <Input value={form.city} onChange={set('city')} placeholder="e.g. Mumbai" />
                </Field>
                <Field label="State">
                  <Input value={form.state} onChange={set('state')} placeholder="e.g. Maharashtra" />
                </Field>
                <Field label="Pincode">
                  <Input value={form.pincode} onChange={set('pincode')} placeholder="400001" maxLength={6} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address">
                    <textarea
                      value={form.address}
                      onChange={set('address')}
                      rows={2}
                      placeholder="Flat/House, Street, Area"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* ── EMPLOYMENT ────────────────────────────────────────────── */}
            {activeTab === 'employment' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Employment Type">
                  <Select value={form.employmentType} onChange={set('employmentType')}>
                    <option value="">Select</option>
                    <option value="salaried">Salaried</option>
                    <option value="self_employed">Self-Employed</option>
                    <option value="business">Business Owner</option>
                  </Select>
                </Field>
                <Field label="Company / Business Name">
                  <Input value={form.companyName} onChange={set('companyName')} placeholder="e.g. Infosys Ltd." />
                </Field>
                <Field label="Monthly Salary / Income (₹)">
                  <Input
                    type="number"
                    value={form.monthlySalary}
                    onChange={set('monthlySalary')}
                    placeholder="e.g. 50000"
                    min={0}
                  />
                </Field>
              </div>
            )}

            {/* ── LOAN ──────────────────────────────────────────────────── */}
            {activeTab === 'loan' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Product / Service Type">
                  <Select value={form.productType} onChange={set('productType')}>
                    <option value="">Select</option>
                    <optgroup label="── Loans ──">
                      <option value="personal_loan">Personal Loan</option>
                      <option value="home_loan">Home Loan</option>
                      <option value="car_loan">Car Loan</option>
                      <option value="business_loan">Business Loan</option>
                      <option value="loan_against_property">Loan Against Property</option>
                      <option value="education_loan">Education Loan</option>
                      <option value="gold_loan">Gold Loan</option>
                    </optgroup>
                    <optgroup label="── Cards ──">
                      <option value="credit_card">Credit Card</option>
                    </optgroup>
                    <optgroup label="── Insurance ──">
                      <option value="health_insurance">Health Insurance</option>
                      <option value="life_insurance">Life Insurance</option>
                      <option value="motor_insurance">Motor Insurance</option>
                      <option value="travel_insurance">Travel Insurance</option>
                    </optgroup>
                    <optgroup label="── Investments ──">
                      <option value="mutual_fund">Mutual Fund</option>
                      <option value="sip">SIP</option>
                      <option value="demat">Demat Account</option>
                    </optgroup>
                    <optgroup label="── Other ──">
                      <option value="general">General Enquiry</option>
                      <option value="other">Other</option>
                    </optgroup>
                  </Select>
                </Field>
                <Field label="Required Loan Amount (₹)">
                  <Input
                    type="number"
                    value={form.loanAmountRequired}
                    onChange={set('loanAmountRequired')}
                    placeholder="e.g. 500000"
                    min={0}
                  />
                </Field>
                <Field label="Existing Bank (salary/current account)">
                  <Input value={form.existingBank} onChange={set('existingBank')} placeholder="e.g. HDFC Bank" />
                </Field>
                <Field label="Salary Account Bank">
                  <Input value={form.salaryAccountBank} onChange={set('salaryAccountBank')} placeholder="e.g. SBI" />
                </Field>
              </div>
            )}

            {/* ── CREDIT ────────────────────────────────────────────────── */}
            {activeTab === 'credit' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="CIBIL Score Range">
                  <Select value={form.cibilScoreRange} onChange={set('cibilScoreRange')}>
                    <option value="">Select</option>
                    <option value="below_600">Below 600 (Poor)</option>
                    <option value="600_699">600–699 (Fair)</option>
                    <option value="700_749">700–749 (Good)</option>
                    <option value="750_800">750–800 (Very Good)</option>
                    <option value="above_800">Above 800 (Excellent)</option>
                    <option value="unknown">Don't Know</option>
                  </Select>
                </Field>
                <Field label="Monthly EMI Obligations (₹)">
                  <Input
                    type="number"
                    value={form.existingEMI}
                    onChange={set('existingEMI')}
                    placeholder="e.g. 12000"
                    min={0}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Existing Loans (comma separated, leave blank if none)">
                    <Input
                      value={form.existingLoans}
                      onChange={set('existingLoans')}
                      placeholder="e.g. Home Loan, Personal Loan"
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* ── DOCUMENTS ─────────────────────────────────────────────── */}
            {activeTab === 'documents' && (
              domLeadId ? (
                <DocumentUpload
                  leadId={domLeadId}
                  documents={documents}
                  onDocumentsChange={handleDocumentChange}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium">Submit the lead form first</p>
                  <p className="text-sm mt-1">Document upload is available after the lead is submitted.</p>
                  <p className="text-sm mt-1">Fill in the other tabs and click <strong>Save Lead</strong>.</p>
                </div>
              )
            )}

            {/* ── DISPOSITION ───────────────────────────────────────────── */}
            {activeTab === 'disposition' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Call Outcome">
                  <Select value={form.callOutcome} onChange={set('callOutcome')}>
                    <option value="">Select</option>
                    <option value="interested">Interested</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="callback">Callback Requested</option>
                    <option value="not_reachable">Not Reachable</option>
                    <option value="wrong_number">Wrong Number</option>
                  </Select>
                </Field>
                <Field label="Callback Date (if applicable)">
                  <Input type="date" value={form.callbackDate} onChange={set('callbackDate')} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Notes / Remarks">
                    <textarea
                      value={form.notes}
                      onChange={set('notes')}
                      rows={5}
                      placeholder="Write call notes, customer requirements, special instructions…"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>

          {activeTab !== 'documents' && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Saving…' : isEdit ? 'Update Lead' : 'Save Lead'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadFormModal;
