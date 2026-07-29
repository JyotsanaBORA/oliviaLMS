import React, { useState, useEffect } from 'react';
import { X, Save, User, Briefcase, CreditCard, FileText, MessageSquare, ChevronDown, ChevronUp, Eye, Phone, MapPin, BarChart2, Users, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../utils/axios';
import toast from 'react-hot-toast';
import DocumentUpload from './DocumentUpload';

const TABS = [
  { key: 'personal',     label: 'Personal',     icon: User },
  { key: 'employment',   label: 'Employment',   icon: Briefcase },
  { key: 'loan',         label: 'Loan',         icon: CreditCard },
  { key: 'credit',       label: 'Credit',       icon: FileText },
  { key: 'cibil_check',  label: 'CIBIL Check',  icon: ShieldCheck },
  { key: 'references',   label: 'References',   icon: Users },
  { key: 'documents',    label: 'Documents',    icon: FileText },
  { key: 'disposition',  label: 'Disposition',  icon: MessageSquare },
];

const EMPTY_FORM = {
  // Core personal
  name: '', dob: '', pan: '', aadhaar: '',
  fatherName: '', motherName: '', maritalStatus: '', spouseName: '',
  educationDetails: '', segment: '', location: '', tcName: '',
  // Contact
  mobile: '', alternateMobile: '', email: '',
  // Current address
  address: '', city: '', state: '', pincode: '',
  currentAddressType: '', yearsAtCurrentAddress: '',
  // Permanent address
  permanentAddress: '', paContactNumber: '',
  // Employment
  employmentType: '', companyName: '', monthlySalary: '',
  officeAddress: '', officeLandline: '', officialEmail: '',
  yearsAtCurrentJob: '', totalJobExp: '', customEmploymentType: '',
  // Loan / credit
  productType: '', loanAmountRequired: '',
  existingBank: '', salaryAccountBank: '',
  cibilScoreRange: '', existingLoans: '', existingEMI: '',
  // References
  ref1Name: '', ref1Contact: '', ref1Address: '',
  ref2Name: '', ref2Contact: '', ref2Address: '',
  // Disposition
  callOutcome: '', callbackDate: '', notes: '', customCallOutcome: '',
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

const LeadFormModal = ({ websiteLead, importedLead, existingDomLead, onClose, onSaved }) => {
  const [activeTab, setActiveTab] = useState('personal');
  const [form, setForm]           = useState(EMPTY_FORM);
  const [documents, setDocuments] = useState([]);
  const [domLeadId, setDomLeadId] = useState(null);
  const [leadRef,   setLeadRef]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [refPanelOpen, setRefPanelOpen] = useState(false); // collapsible imported data panel

  // CIBIL check
  const [cibilForm,      setCibilForm]      = useState({
    firstName: '', lastName: '', gender: '',
    phoneNumber: '', panNumber: '', dateOfBirth: '', pincode: '', address: '',
  });
  const [cibilChecking, setCibilChecking] = useState(false);
  const [cibilResult,   setCibilResult]   = useState(null);
  const [cibilError,    setCibilError]    = useState('');

  const isEdit = !!domLeadId;

  // Pre-fill from website lead / imported lead / existing DomLead
  useEffect(() => {
    if (existingDomLead) {
      setDomLeadId(existingDomLead._id);
      setLeadRef(existingDomLead.leadRef || null);
      setDocuments(existingDomLead.documents || []);
      const src = websiteLead || importedLead || {};
      setForm({
        name:               existingDomLead.name              || src.name         || '',
        dob:                existingDomLead.dob               || '',
        pan:                existingDomLead.pan               || src.pan          || '',
        aadhaar:            existingDomLead.aadhaar           || '',
        fatherName:         existingDomLead.fatherName        || '',
        motherName:         existingDomLead.motherName        || '',
        maritalStatus:      existingDomLead.maritalStatus     || '',
        spouseName:         existingDomLead.spouseName        || '',
        educationDetails:   existingDomLead.educationDetails  || '',
        segment:            existingDomLead.segment           || '',
        location:           existingDomLead.location          || src.city         || '',
        tcName:             existingDomLead.tcName            || '',
        mobile:             existingDomLead.mobile            || src.mobile       || '',
        alternateMobile:    existingDomLead.alternateMobile   || '',
        email:              existingDomLead.email             || src.email        || '',
        address:            existingDomLead.address           || '',
        city:               existingDomLead.city              || src.city         || '',
        state:              existingDomLead.state             || src.state        || '',
        pincode:            existingDomLead.pincode           || '',
        currentAddressType:    existingDomLead.currentAddressType    || '',
        yearsAtCurrentAddress: existingDomLead.yearsAtCurrentAddress != null ? String(existingDomLead.yearsAtCurrentAddress) : '',
        permanentAddress:   existingDomLead.permanentAddress  || '',
        paContactNumber:    existingDomLead.paContactNumber   || '',
        employmentType:     existingDomLead.employmentType    || src.employment   || '',
        companyName:        existingDomLead.companyName       || '',
        monthlySalary:      existingDomLead.monthlySalary     || src.monthlyIncome || '',
        officeAddress:      existingDomLead.officeAddress     || '',
        officeLandline:     existingDomLead.officeLandline    || '',
        officialEmail:      existingDomLead.officialEmail     || '',
        yearsAtCurrentJob:  existingDomLead.yearsAtCurrentJob != null ? String(existingDomLead.yearsAtCurrentJob) : '',
        totalJobExp:        existingDomLead.totalJobExp       != null ? String(existingDomLead.totalJobExp)       : '',
        customEmploymentType: existingDomLead.customEmploymentType || '',
        productType:        existingDomLead.productType       || src.productType  || '',
        loanAmountRequired: existingDomLead.loanAmountRequired || src.loanAmount  || '',
        existingBank:       existingDomLead.existingBank      || '',
        salaryAccountBank:  existingDomLead.salaryAccountBank || '',
        cibilScoreRange:    existingDomLead.cibilScoreRange   || '',
        existingLoans:      (existingDomLead.existingLoans || []).join(', '),
        existingEMI:        existingDomLead.existingEMI       || '',
        ref1Name:           existingDomLead.ref1Name          || '',
        ref1Contact:        existingDomLead.ref1Contact       || '',
        ref1Address:        existingDomLead.ref1Address       || '',
        ref2Name:           existingDomLead.ref2Name          || '',
        ref2Contact:        existingDomLead.ref2Contact       || '',
        ref2Address:        existingDomLead.ref2Address       || '',
        callOutcome:        existingDomLead.callOutcome       || '',
        callbackDate:       existingDomLead.callbackDate      || '',
        notes:              existingDomLead.notes             || importedLead?.remarks || '',
        customCallOutcome:  existingDomLead.customCallOutcome || '',
      });
    } else if (importedLead) {
      setForm((prev) => ({
        ...prev,
        name:           importedLead.name          || '',
        mobile:         importedLead.mobile         || '',
        email:          importedLead.email          || '',
        city:           importedLead.city           || '',
        state:          importedLead.state          || '',
        employmentType: importedLead.employment     || '',
        monthlySalary:  importedLead.monthlyIncome  || '',
        productType:    importedLead.productType    || '',
        loanAmountRequired: importedLead.loanAmount || '',
        notes:          importedLead.remarks        || '',
      }));
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
  }, [websiteLead, importedLead, existingDomLead]);

  const set  = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const setCF = (k) => (e) => setCibilForm((prev) => ({ ...prev, [k]: e.target.value }));

  const mapScoreToRange = (scoreStr) => {
    const n = parseInt(scoreStr, 10);
    if (isNaN(n) || n <= 0) return 'unknown';
    if (n < 600) return 'below_600';
    if (n < 700) return '600_699';
    if (n < 750) return '700_749';
    if (n <= 800) return '750_800';
    return 'above_800';
  };

  const handleCibilCheck = async () => {
    const REQUIRED = ['firstName', 'lastName', 'gender', 'phoneNumber', 'panNumber', 'dateOfBirth', 'pincode', 'address'];
    const missing  = REQUIRED.filter(k => !cibilForm[k]?.trim());
    if (missing.length) {
      setCibilError(`Please fill in: ${missing.join(', ')}`);
      return;
    }
    setCibilChecking(true);
    setCibilError('');
    try {
      const res            = await api.post('/domestic-api/cibil/check', cibilForm);
      const signzyResponse = res.data?.data;   // Signzy's full response object
      setCibilResult(signzyResponse);
      const scores = signzyResponse?.data?.CIBILReport?.consumerCreditData?.[0]?.scores;
      if (scores?.length) {
        const range = mapScoreToRange(scores[0]?.score);
        setForm(prev => ({ ...prev, cibilScoreRange: range }));
        toast.success(`CIBIL Score: ${parseInt(scores[0].score, 10)} — score range updated.`);
      }
    } catch (err) {
      // Always coerce to a plain string — Signzy can return objects in error fields
      const raw = err.response?.data?.message;
      const msg = typeof raw === 'string'
        ? raw
        : raw
          ? JSON.stringify(raw)
          : (err.message || 'CIBIL check failed. Please try again.');
      setCibilError(msg);
    } finally {
      setCibilChecking(false);
    }
  };

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
        monthlySalary:         form.monthlySalary         ? Number(form.monthlySalary)         : undefined,
        loanAmountRequired:    form.loanAmountRequired    ? Number(form.loanAmountRequired)    : undefined,
        existingEMI:           form.existingEMI           ? Number(form.existingEMI)           : undefined,
        yearsAtCurrentAddress: form.yearsAtCurrentAddress ? Number(form.yearsAtCurrentAddress) : undefined,
        yearsAtCurrentJob:     form.yearsAtCurrentJob     ? Number(form.yearsAtCurrentJob)     : undefined,
        totalJobExp:           form.totalJobExp           ? Number(form.totalJobExp)           : undefined,
      };

      if (isEdit) {
        const res = await api.patch(`/domestic-api/leads/${domLeadId}`, payload);
        setLeadRef(res.data?.data?.leadRef || leadRef);
        toast.success('Lead updated successfully!');
      } else {
        const body = { ...payload };
        if (websiteLead?._id)  body.sourceWebsiteLead  = websiteLead._id;
        if (importedLead?._id) body.sourceImportedLead = importedLead._id;
        const res = await api.post('/domestic-api/leads', body);
        setDomLeadId(res.data.data._id);
        setLeadRef(res.data.data.leadRef || null);
        toast.success('Lead submitted successfully!');
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

  // Determine header subtitle
  const headerSubtitle = importedLead
    ? `${importedLead.name || ''} · ${importedLead.mobile || ''} · Pool Lead`
    : websiteLead
      ? `${websiteLead.name} · ${websiteLead.mobile} · ${websiteLead.productType}`
      : isEdit ? `${form.name} · ${form.mobile}` : 'Enter customer details manually';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`flex items-start justify-between px-6 py-4 flex-shrink-0 ${
          importedLead
            ? 'bg-gradient-to-r from-[#065F36] to-[#00874A]'
            : 'bg-gradient-to-r from-blue-700 to-blue-900'
        }`}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white">
                {isEdit
                  ? 'Edit Lead'
                  : importedLead
                    ? '📊 Work on Imported Lead'
                    : websiteLead
                      ? '🌐 Work on Meta Lead'
                      : 'New Manual Lead'}
              </h2>
              {/* Source badge */}
              {!isEdit && (websiteLead || importedLead) && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  importedLead ? 'bg-violet-500/30 text-white border-violet-300/40' : 'bg-teal-500/30 text-white border-teal-300/40'
                }`}>
                  {importedLead ? '📊 Imported Data' : '🌐 Meta / Website'}
                </span>
              )}
              {leadRef && (
                <span className="font-mono text-xs font-bold bg-white/20 text-green-300 border border-green-400/40 px-2 py-0.5 rounded tracking-widest">
                  {leadRef}
                </span>
              )}
            </div>
            <p className="text-white/70 text-sm mt-0.5">{headerSubtitle}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-white/70 transition-colors mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto flex-shrink-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                if (key === 'cibil_check' && !cibilResult) {
                  const trimmed   = form.name.trim();
                  const lastSpace = trimmed.lastIndexOf(' ');
                  setCibilForm(prev => ({
                    firstName:   lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed,
                    lastName:    lastSpace > 0 ? trimmed.slice(lastSpace + 1) : '',
                    gender:      prev.gender || '',
                    phoneNumber: form.mobile  || prev.phoneNumber,
                    panNumber:   form.pan     || prev.panNumber,
                    dateOfBirth: form.dob     || prev.dateOfBirth,
                    pincode:     form.pincode || prev.pincode,
                    address:     form.address || prev.address,
                  }));
                  setCibilError('');
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
                activeTab === key
                  ? key === 'cibil_check'
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                    : 'border-blue-600 text-blue-700 bg-white'
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

          {/* ── Imported Data Reference Panel (only when working a pool lead) ── */}
          {importedLead && (
            <div className="border-b border-gray-100 flex-shrink-0">
              {/* Toggle bar */}
              <button type="button"
                onClick={() => setRefPanelOpen(p => !p)}
                className={`w-full flex items-center justify-between px-5 py-3 text-xs font-bold transition-colors ${
                  refPanelOpen ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-500 hover:bg-violet-50 hover:text-violet-700'
                }`}>
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  <span>📋 View Imported Lead Data (reference while working)</span>
                  {(importedLead.totalOutstandingAmount || importedLead.noOfInstallmentOverdue) && (
                    <span className="flex items-center gap-2 ml-2">
                      {importedLead.totalOutstandingAmount && (
                        <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-bold">
                          OS: ₹{importedLead.totalOutstandingAmount}
                        </span>
                      )}
                      {importedLead.noOfInstallmentOverdue && parseInt(importedLead.noOfInstallmentOverdue) > 0 && (
                        <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-xs font-bold">
                          {importedLead.noOfInstallmentOverdue} EMI overdue
                        </span>
                      )}
                      {importedLead.cibilScore && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                          parseInt(importedLead.cibilScore) >= 700 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          parseInt(importedLead.cibilScore) >= 600 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          'bg-red-100 text-red-700 border-red-200'
                        }`}>
                          CIBIL {importedLead.cibilScore}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {refPanelOpen
                  ? <ChevronUp className="h-4 w-4 flex-shrink-0" />
                  : <ChevronDown className="h-4 w-4 flex-shrink-0" />
                }
              </button>

              {/* Expanded reference content */}
              {refPanelOpen && (
                <div className="bg-violet-50/50 border-t border-violet-100 px-5 py-4 space-y-4 max-h-72 overflow-y-auto">
                  {/* Row 1: Financial highlights */}
                  <div>
                    <p className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <BarChart2 className="h-3.5 w-3.5" /> Financial Overview
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Total Outstanding', val: importedLead.totalOutstandingAmount, prefix: '₹', highlight: true },
                        { label: 'Principal',          val: importedLead.principalOutstanding,   prefix: '₹', highlight: true },
                        { label: 'Amount Financed',    val: importedLead.amountFinanced,          prefix: '₹' },
                        { label: 'Disbursal Amt',      val: importedLead.disbursalAmount,         prefix: '₹' },
                        { label: 'CIBIL Score',        val: importedLead.cibilScore },
                        { label: 'EMI Overdue',        val: importedLead.noOfInstallmentOverdue },
                        { label: 'Live Loans',         val: importedLead.countOfLiveLoans },
                        { label: 'Loan Type',          val: importedLead.loanType || importedLead.productType },
                      ].filter(x => x.val).map(({ label, val, prefix = '', highlight }) => (
                        <div key={label} className={`rounded-xl p-2.5 ${highlight ? 'bg-amber-100 border border-amber-200' : 'bg-white border border-gray-100'}`}>
                          <p className="text-xs text-gray-400 font-medium">{label}</p>
                          <p className={`text-sm font-bold mt-0.5 ${highlight ? 'text-amber-800' : 'text-gray-700'}`}>{prefix}{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Row 2: Contact & Address */}
                  <div>
                    <p className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> Contact & Address
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { label: 'Mobile',             val: importedLead.mobile },
                        { label: 'Residence Phone',    val: importedLead.residencePhoneNumber },
                        { label: 'Office Phone',       val: importedLead.officePhoneNumber },
                        { label: 'Residence Address',  val: importedLead.residenceAddress },
                        { label: 'Office Address',     val: importedLead.officeAddress },
                      ].filter(x => x.val).map(({ label, val }) => (
                        <div key={label} className="bg-white border border-gray-100 rounded-xl p-2.5">
                          <p className="text-xs text-gray-400 font-medium">{label}</p>
                          <p className="text-sm font-semibold text-gray-700 mt-0.5 break-words">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Row 3: Loan & Other Details */}
                  <div>
                    <p className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" /> Loan & Profile
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Vintage',       val: importedLead.vintage },
                        { label: 'Expiry Status', val: importedLead.expiryStatus },
                        { label: 'Expiry Date',   val: importedLead.expiryDate },
                        { label: 'Sanction Date', val: importedLead.sanctionDate },
                        { label: 'Bank Name',     val: importedLead.bankName },
                        { label: 'Employment',    val: importedLead.employment },
                        { label: 'Firm/Employer', val: importedLead.firmEmployeeName },
                        { label: 'PAN',           val: importedLead.panNumber },
                        { label: 'Aadhar No',     val: importedLead.customerAadharNo },
                        { label: 'DOB / Age',     val: [importedLead.dateOfBirth, importedLead.age].filter(Boolean).join(' / ') },
                        { label: 'Property Val',  val: importedLead.propertyValueLatest, prefix: '₹' },
                        { label: 'Asset',         val: importedLead.assetDescription },
                      ].filter(x => x.val).map(({ label, val, prefix = '' }) => (
                        <div key={label} className="bg-white border border-gray-100 rounded-xl p-2.5">
                          <p className="text-xs text-gray-400 font-medium">{label}</p>
                          <p className="text-sm font-semibold text-gray-700 mt-0.5">{prefix}{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="p-6">
            {/* ── PERSONAL ──────────────────────────────────────────────── */}
            {activeTab === 'personal' && (
              <div className="space-y-6">

                {/* Segment / Location / TC */}
                <div>
                  <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Segment &amp; Source</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Segment (Pl / Od)">
                      <Input value={form.segment} onChange={set('segment')} placeholder="e.g. PL" />
                    </Field>
                    <Field label="Location">
                      <Input value={form.location} onChange={set('location')} placeholder="e.g. Mumbai" />
                    </Field>
                    <Field label="TC Name">
                      <Input value={form.tcName} onChange={set('tcName')} placeholder="TC Agent name" />
                    </Field>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Core personal */}
                <div>
                  <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><User className="h-3 w-3" /> Personal Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Applicant Name" required>
                      <Input value={form.name} onChange={set('name')} placeholder="e.g. Rohan Sharma" />
                    </Field>
                    <Field label="Father's Name">
                      <Input value={form.fatherName} onChange={set('fatherName')} placeholder="e.g. Ramesh Sharma" />
                    </Field>
                    <Field label="Mother's Name">
                      <Input value={form.motherName} onChange={set('motherName')} placeholder="e.g. Sunita Sharma" />
                    </Field>
                    <Field label="Date of Birth">
                      <Input type="date" value={form.dob} onChange={set('dob')} />
                    </Field>
                    <Field label="PAN Number">
                      <Input value={form.pan} onChange={set('pan')} placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }} />
                    </Field>
                    <Field label="Aadhaar Number">
                      <Input value={form.aadhaar} onChange={set('aadhaar')} placeholder="XXXX XXXX XXXX" maxLength={12} />
                    </Field>
                    <Field label="Education Details">
                      <Input value={form.educationDetails} onChange={set('educationDetails')} placeholder="e.g. Graduate, MBA" />
                    </Field>
                    <Field label="Marital Status">
                      <Select value={form.maritalStatus} onChange={set('maritalStatus')}>
                        <option value="">Select</option>
                        <option value="single">Single</option>
                        <option value="married">Married</option>
                        <option value="divorced">Divorced</option>
                        <option value="widowed">Widowed</option>
                      </Select>
                    </Field>
                    {form.maritalStatus === 'married' && (
                      <Field label="Spouse Name">
                        <Input value={form.spouseName} onChange={set('spouseName')} placeholder="Spouse full name" />
                      </Field>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Contact */}
                <div>
                  <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Phone className="h-3 w-3" /> Contact</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Customer Mobile Number" required>
                      <Input value={form.mobile} onChange={set('mobile')} placeholder="+91 9XXXXXXXXX" />
                    </Field>
                    <Field label="Alternate Mobile">
                      <Input value={form.alternateMobile} onChange={set('alternateMobile')} placeholder="+91 9XXXXXXXXX" />
                    </Field>
                    <Field label="Personal Email ID">
                      <Input type="email" value={form.email} onChange={set('email')} placeholder="rohan@gmail.com" />
                    </Field>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Current Residential Address */}
                <div>
                  <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Current Residential Address</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Field label="Current Address">
                        <textarea value={form.address} onChange={set('address')} rows={2}
                          placeholder="Flat/House, Street, Area"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </Field>
                    </div>
                    <Field label="City">
                      <Input value={form.city} onChange={set('city')} placeholder="e.g. Mumbai" />
                    </Field>
                    <Field label="State">
                      <Input value={form.state} onChange={set('state')} placeholder="e.g. Maharashtra" />
                    </Field>
                    <Field label="Pincode">
                      <Input value={form.pincode} onChange={set('pincode')} placeholder="400001" maxLength={6} />
                    </Field>
                    <Field label="Rented / Owned">
                      <Select value={form.currentAddressType} onChange={set('currentAddressType')}>
                        <option value="">Select</option>
                        <option value="rented">Rented</option>
                        <option value="owned">Owned</option>
                      </Select>
                    </Field>
                    <Field label="No. of Years at Above Residence">
                      <Input type="number" min={0} value={form.yearsAtCurrentAddress} onChange={set('yearsAtCurrentAddress')} placeholder="e.g. 3" />
                    </Field>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Permanent Address */}
                <div>
                  <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Permanent Address</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Field label="Permanent Address">
                        <textarea value={form.permanentAddress} onChange={set('permanentAddress')} rows={2}
                          placeholder="If different from current address"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </Field>
                    </div>
                    <Field label="PA Contact Number">
                      <Input value={form.paContactNumber} onChange={set('paContactNumber')} placeholder="Contact at permanent address" />
                    </Field>
                  </div>
                </div>

              </div>
            )}

            {/* ── EMPLOYMENT ────────────────────────────────────────────── */}
            {activeTab === 'employment' && (
              <div className="space-y-6">

                <div>
                  <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Briefcase className="h-3 w-3" /> Employment Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Employment Type">
                      <Select value={form.employmentType} onChange={set('employmentType')}>
                        <option value="">Select</option>
                        <option value="salaried">Salaried</option>
                        <option value="self_employed">Self-Employed</option>
                        <option value="business">Business Owner</option>
                        <option value="unemployed">Unemployed</option>
                        <option value="other">Other (specify)</option>
                      </Select>
                    </Field>
                    {form.employmentType === 'other' && (
                      <Field label="Specify Employment">
                        <Input value={form.customEmploymentType} onChange={set('customEmploymentType')} placeholder="e.g. Freelancer, Retired, Student…" />
                      </Field>
                    )}
                    <Field label="Present Employer / Company Name">
                      <Input value={form.companyName} onChange={set('companyName')} placeholder="e.g. Infosys Ltd." />
                    </Field>
                    <Field label="Monthly Salary / Income (₹)">
                      <Input type="number" value={form.monthlySalary} onChange={set('monthlySalary')} placeholder="e.g. 50000" min={0} />
                    </Field>
                    <Field label="No. of Years at Current Job">
                      <Input type="number" value={form.yearsAtCurrentJob} onChange={set('yearsAtCurrentJob')} placeholder="e.g. 2" min={0} />
                    </Field>
                    <Field label="Total Job Experience (years)">
                      <Input type="number" value={form.totalJobExp} onChange={set('totalJobExp')} placeholder="e.g. 5" min={0} />
                    </Field>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Office Contact</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Field label="Office Address">
                        <textarea value={form.officeAddress} onChange={set('officeAddress')} rows={2}
                          placeholder="Office / company address"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </Field>
                    </div>
                    <Field label="Office Landline Number">
                      <Input value={form.officeLandline} onChange={set('officeLandline')} placeholder="e.g. 022-12345678" />
                    </Field>
                    <Field label="Official Mail ID">
                      <Input type="email" value={form.officialEmail} onChange={set('officialEmail')} placeholder="rohan@company.com" />
                    </Field>
                  </div>
                </div>

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

            {/* ── CIBIL CHECK ───────────────────────────────────────────── */}
            {activeTab === 'cibil_check' && (
              <div className="space-y-5">

                {/* Header banner */}
                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                  <div className="p-2 bg-indigo-100 rounded-lg flex-shrink-0">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-indigo-800">Live CIBIL Score Check</p>
                    <p className="text-xs text-indigo-500 mt-0.5">Powered by Signzy — verify customer's credit score in real time</p>
                  </div>
                  {cibilResult && (
                    <button type="button" onClick={() => { setCibilResult(null); setCibilError(''); }}
                      className="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg bg-white transition-colors flex-shrink-0">
                      Run Again
                    </button>
                  )}
                </div>

                {/* ── Input form ── */}
                {!cibilResult && (
                  <>
                    <p className="text-xs text-gray-500">Details are pre-filled from the lead form. Select gender and click <strong>Run CIBIL Check</strong>.</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="First Name">
                        <Input value={cibilForm.firstName} onChange={setCF('firstName')} placeholder="e.g. RAHUL KUMAR" />
                      </Field>
                      <Field label="Last Name">
                        <Input value={cibilForm.lastName}  onChange={setCF('lastName')}  placeholder="e.g. SHARMA" />
                      </Field>
                      <Field label="Gender" required>
                        <Select value={cibilForm.gender} onChange={setCF('gender')}>
                          <option value="">Select gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Transgender">Transgender</option>
                        </Select>
                      </Field>
                      <Field label="Mobile Number">
                        <Input value={cibilForm.phoneNumber} onChange={setCF('phoneNumber')} placeholder="9876543210" />
                      </Field>
                      <Field label="PAN Number">
                        <Input value={cibilForm.panNumber} onChange={setCF('panNumber')} placeholder="ABCDE1234F"
                          style={{ textTransform: 'uppercase' }} />
                      </Field>
                      <Field label="Date of Birth">
                        <Input type="date" value={cibilForm.dateOfBirth} onChange={setCF('dateOfBirth')} />
                      </Field>
                      <Field label="Pincode">
                        <Input value={cibilForm.pincode} onChange={setCF('pincode')} placeholder="400001" />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Address">
                          <textarea
                            value={cibilForm.address}
                            onChange={setCF('address')}
                            rows={2}
                            placeholder="Full residential address"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          />
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

                    {cibilError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                        <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                        <p className="text-xs text-red-700">{cibilError}</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleCibilCheck}
                      disabled={cibilChecking}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl transition-colors shadow-sm"
                    >
                      {cibilChecking
                        ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <ShieldCheck className="h-4 w-4" />}
                      {cibilChecking ? 'Checking…' : 'Run CIBIL Check'}
                    </button>
                  </>
                )}

                {/* ── Result panel ── */}
                {cibilResult && (() => {
                  const cibilData  = cibilResult?.data;
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
                    : scoreVal >= 650 ? { label: 'Fair',      cls: 'bg-amber-100  text-amber-700  border-amber-200'   }
                    :                  { label: 'Poor',       cls: 'bg-red-100    text-red-700    border-red-200'     };

                  return (
                    <div className="space-y-4">

                      {/* Score banner */}
                      <div className="flex items-center justify-between bg-white border-2 border-indigo-200 rounded-2xl px-6 py-5 shadow-sm">
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">CIBIL Score</p>
                          <p className={`text-5xl font-black mt-1 ${
                            scoreVal === null ? 'text-gray-400'
                              : scoreVal >= 700 ? 'text-emerald-600'
                              : scoreVal >= 600 ? 'text-amber-600'
                              : 'text-red-600'
                          }`}>
                            {scoreVal !== null ? scoreVal : '—'}
                          </p>
                          {reportName && <p className="text-xs text-gray-400 mt-1">{reportName}</p>}
                        </div>
                        <div className="text-right space-y-2">
                          {scoreBand && (
                            <span className={`inline-block text-sm font-bold px-4 py-2 rounded-full border ${scoreBand.cls}`}>
                              {scoreBand.label}
                            </span>
                          )}
                          {scoreObj?.scoreName && (
                            <p className="text-xs text-gray-400">{scoreObj.scoreName}</p>
                          )}
                        </div>
                      </div>

                      {/* Summary grid */}
                      {(Object.keys(acctSumm).length > 0 || Object.keys(inqSumm).length > 0) && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: 'Total Accounts',   val: acctSumm.totalAccounts },
                            { label: 'Overdue Accounts', val: acctSumm.overdueAccounts, warn: acctSumm.overdueAccounts > 0 },
                            { label: 'Current Balance',  val: acctSumm.currentBalance  != null ? `₹${acctSumm.currentBalance.toLocaleString('en-IN')}` : null },
                            { label: 'Overdue Balance',  val: acctSumm.overdueBalance  != null ? `₹${acctSumm.overdueBalance.toLocaleString('en-IN')}` : null, warn: acctSumm.overdueBalance > 0 },
                            { label: 'Enquiries (30d)',  val: inqSumm.inquiryPast30Days },
                            { label: 'Enquiries (12m)',  val: inqSumm.inquiryPast12Months },
                            { label: 'Total Enquiries',  val: inqSumm.totalInquiry },
                            { label: 'Oldest Account',   val: acctSumm.oldestDateOpened },
                          ].filter(x => x.val != null).map(({ label, val, warn }) => (
                            <div key={label} className={`rounded-xl p-3 border ${
                              warn ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'
                            }`}>
                              <p className="text-xs text-gray-400">{label}</p>
                              <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-red-700' : 'text-gray-700'}`}>{val}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* PDF download */}
                      {pdfUrl && (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                        >
                          <FileText className="h-4 w-4" /> Download Full PDF Report
                        </a>
                      )}
                    </div>
                  );
                })()}

              </div>
            )}

            {/* ── REFERENCES ────────────────────────────────────────────── */}
            {activeTab === 'references' && (
              <div className="space-y-6">

                {/* Reference 1 */}
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                  <p className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Reference 1 — Relative (must)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Name">
                      <Input value={form.ref1Name} onChange={set('ref1Name')} placeholder="Relative full name" />
                    </Field>
                    <Field label="Contact No.">
                      <Input value={form.ref1Contact} onChange={set('ref1Contact')} placeholder="+91 9XXXXXXXXX" />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Address">
                        <textarea value={form.ref1Address} onChange={set('ref1Address')} rows={2}
                          placeholder="Relative's address"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Reference 2 */}
                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4">
                  <p className="text-[11px] font-extrabold text-purple-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Reference 2 — Friend
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Name">
                      <Input value={form.ref2Name} onChange={set('ref2Name')} placeholder="Friend's full name" />
                    </Field>
                    <Field label="Contact No.">
                      <Input value={form.ref2Contact} onChange={set('ref2Contact')} placeholder="+91 9XXXXXXXXX" />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Address">
                        <textarea value={form.ref2Address} onChange={set('ref2Address')} rows={2}
                          placeholder="Friend's address"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </Field>
                    </div>
                  </div>
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
                    <option value="interested">✅ Interested</option>
                    <option value="not_interested">❌ Not Interested</option>
                    <option value="callback">📞 Callback Requested</option>
                    <option value="not_reachable">📵 Not Reachable</option>
                    <option value="not_answering">🔕 Not Answering</option>
                    <option value="wrong_number">❓ Wrong Number</option>
                    <option value="other">✏️ Other (specify)</option>
                  </Select>
                </Field>
                {form.callOutcome === 'other' && (
                  <Field label="Specify Disposition">
                    <Input value={form.customCallOutcome} onChange={set('customCallOutcome')} placeholder="e.g. Busy, Switched off, Language barrier…" />
                  </Field>
                )}
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
