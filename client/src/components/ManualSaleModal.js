import React, { useState, useEffect } from 'react';
import { X, PlusCircle, Users, List, Calendar, Tag, DollarSign, CreditCard, User, Phone, Mail, Loader } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const PAYMENT_STATUSES = ['', 'Cleared', 'Pending', 'NSF', 'Cancellation', 'Refunded'];
const PAYMENT_TYPES    = ['', 'Monthly', 'Semi Monthly'];

const EMPTY_FORM = {
  vendorId:     '',
  listMode:     'existing', // 'existing' | 'new'
  listName:     '',
  newListName:  '',
  runDate:      new Date().toISOString().slice(0, 10),
  runLabel:     '',
  first_name:   '',
  last_name:    '',
  phone_number: '',
  email:        '',
  debt:         '',
  enrolled_debt:'',
  entry_date:   new Date().toISOString().slice(0, 10),
  paymentStatus:'',
  paymentType:  '',
  draftDate1:   '',
  draftDate2:   ''
};

const ManualSaleModal = ({ isOpen, onClose, onSaleCreated }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [vendors, setVendors]           = useState([]);
  const [existingLists, setExistingLists] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingLists, setLoadingLists]   = useState(false);
  const [submitting, setSubmitting]       = useState(false);

  // Load vendors when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setLoadingVendors(true);
    axios.get('/api/data-vendor-uploads/vendors')
      .then(res => { if (res.data?.success) setVendors(res.data.data || []); })
      .catch(() => toast.error('Failed to load data vendors'))
      .finally(() => setLoadingVendors(false));
  }, [isOpen]);

  // Load existing lists when vendor changes
  useEffect(() => {
    if (!form.vendorId) { setExistingLists([]); return; }
    setLoadingLists(true);
    axios.get(`/api/data-vendor-uploads/vendors/${form.vendorId}/lists`)
      .then(res => {
        if (res.data?.success) {
          const lists = res.data.data || [];
          setExistingLists(lists);
          setForm(f => ({ ...f, listMode: lists.length > 0 ? 'existing' : 'new', listName: '', newListName: '' }));
        }
      })
      .catch(() => toast.error('Failed to load lists'))
      .finally(() => setLoadingLists(false));
  }, [form.vendorId]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setForm(EMPTY_FORM);
      setVendors([]);
      setExistingLists([]);
    }
  }, [isOpen]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const resolvedListName = form.listMode === 'new' ? form.newListName.trim() : form.listName;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vendorId)          return toast.error('Please select a data vendor');
    if (!resolvedListName)       return toast.error('Please select or enter a list name');
    if (!form.first_name.trim()) return toast.error('First name is required');
    if (!form.phone_number.trim()) return toast.error('Phone number is required');
    if (!form.enrolled_debt)     return toast.error('Enrolled debt is required');

    setSubmitting(true);
    try {
      const payload = {
        vendorId:     form.vendorId,
        listName:     resolvedListName,
        runDate:      form.runDate,
        runLabel:     form.runLabel,
        first_name:   form.first_name.trim(),
        last_name:    form.last_name.trim(),
        phone_number: form.phone_number.trim(),
        email:        form.email.trim(),
        debt:         form.debt,
        enrolled_debt: form.enrolled_debt,
        entry_date:   form.entry_date,
        paymentStatus: form.paymentStatus || undefined,
        paymentType:   form.paymentType   || undefined,
        draftDate1:    form.draftDate1    || undefined,
        draftDate2:    form.draftDate2    || undefined
      };

      const res = await axios.post('/api/data-vendor-uploads/manual-sale', payload);
      if (res.data?.success) {
        toast.success(res.data.message || 'Manual sale created');
        if (onSaleCreated) onSaleCreated();
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create sale');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl z-10 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <PlusCircle size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Add Manual Sale</h3>
                  <p className="text-emerald-100 text-xs">Create a SALE record manually for a data vendor</p>
                </div>
              </div>
              <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">

            {/* ── Data Vendor ─────────────────────────────────── */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                <Users size={14} className="text-emerald-600" />
                Data Vendor <span className="text-red-500">*</span>
              </label>
              {loadingVendors ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader size={14} className="animate-spin" /> Loading vendors…
                </div>
              ) : (
                <select
                  value={form.vendorId}
                  onChange={e => set('vendorId', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                >
                  <option value="">— Select a vendor —</option>
                  {vendors.map(v => (
                    <option key={v._id} value={v._id}>{v.name} — {v.email}</option>
                  ))}
                </select>
              )}
            </div>

            {/* ── List Name ───────────────────────────────────── */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                <List size={14} className="text-emerald-600" />
                List Name <span className="text-red-500">*</span>
              </label>
              {form.vendorId && (
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => set('listMode', 'existing')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.listMode === 'existing' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Select Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => set('listMode', 'new')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.listMode === 'new' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    + New List
                  </button>
                </div>
              )}
              {loadingLists ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader size={14} className="animate-spin" /> Loading lists…
                </div>
              ) : form.listMode === 'existing' ? (
                <select
                  value={form.listName}
                  onChange={e => set('listName', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={!form.vendorId}
                >
                  <option value="">— Choose a list —</option>
                  {existingLists.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.newListName}
                  onChange={e => set('newListName', e.target.value)}
                  placeholder="e.g. JBL 1st July '26"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              )}
            </div>

            {/* ── Run Date & Run Label ─────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Calendar size={14} className="text-emerald-600" />
                  Run Date
                </label>
                <input
                  type="date"
                  value={form.runDate}
                  onChange={e => set('runDate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Tag size={14} className="text-emerald-600" />
                  Run Label <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.runLabel}
                  onChange={e => set('runLabel', e.target.value)}
                  placeholder="e.g. Morning Run"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Lead / Client Details</p>
            </div>

            {/* ── Name ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <User size={14} className="text-blue-600" />
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder="John"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <User size={14} className="text-blue-600" />
                  Last Name
                </label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  placeholder="Doe"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* ── Phone & Email ────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Phone size={14} className="text-blue-600" />
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={e => set('phone_number', e.target.value)}
                  placeholder="8001234567"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Mail size={14} className="text-blue-600" />
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="john@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* ── Debt & Enrolled Debt & Enrollment Date ───────── */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <DollarSign size={14} className="text-purple-600" />
                  Debt
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.debt}
                  onChange={e => set('debt', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <DollarSign size={14} className="text-purple-600" />
                  Enrolled Debt <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.enrolled_debt}
                  onChange={e => set('enrolled_debt', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Calendar size={14} className="text-purple-600" />
                  Enrollment Date
                </label>
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={e => set('entry_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Payment Details <span className="text-gray-400 font-normal">(optional)</span></p>
            </div>

            {/* ── Payment Status & Type ────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <CreditCard size={14} className="text-orange-600" />
                  Payment Status
                </label>
                <select
                  value={form.paymentStatus}
                  onChange={e => set('paymentStatus', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {PAYMENT_STATUSES.map(s => (
                    <option key={s} value={s}>{s || '— Not set —'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <CreditCard size={14} className="text-orange-600" />
                  Payment Type
                </label>
                <select
                  value={form.paymentType}
                  onChange={e => set('paymentType', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {PAYMENT_TYPES.map(t => (
                    <option key={t} value={t}>{t || '— Not set —'}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Draft Dates ──────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Calendar size={14} className="text-orange-600" />
                  Draft Date 1
                </label>
                <input
                  type="date"
                  value={form.draftDate1}
                  onChange={e => set('draftDate1', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Calendar size={14} className="text-orange-600" />
                  Draft Date 2
                </label>
                <input
                  type="date"
                  value={form.draftDate2}
                  onChange={e => set('draftDate2', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {submitting ? <Loader size={14} className="animate-spin" /> : <PlusCircle size={14} />}
              {submitting ? 'Creating…' : 'Create Sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualSaleModal;
