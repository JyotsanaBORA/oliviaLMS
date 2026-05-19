import React, { useState, useEffect } from 'react';
import { X, Upload, Users, FileSpreadsheet, Loader, Plus, List, Calendar, Tag } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const DataVendorShareModal = ({ isOpen, onClose }) => {
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [existingLists, setExistingLists] = useState([]);
  const [listMode, setListMode] = useState('existing'); // 'existing' | 'new'
  const [selectedList, setSelectedList] = useState('');
  const [newListName, setNewListName] = useState('');
  const [runDate, setRunDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [runLabel, setRunLabel] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);

  // Load vendors on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingVendors(true);
    axios.get('/api/data-vendor-uploads/vendors')
      .then(res => { if (res.data?.success) setVendors(res.data.data); })
      .catch(() => toast.error('Failed to load data vendors'))
      .finally(() => setLoadingVendors(false));
  }, [isOpen]);

  // Load existing lists when vendor changes
  useEffect(() => {
    if (!selectedVendor) { setExistingLists([]); return; }
    setLoadingLists(true);
    setSelectedList('');
    setListMode('existing');
    axios.get(`/api/data-vendor-uploads/vendors/${selectedVendor}/lists`)
      .then(res => {
        if (res.data?.success) {
          const lists = res.data.data || [];
          setExistingLists(lists);
          // Auto-switch to new if no existing lists
          if (lists.length === 0) setListMode('new');
        }
      })
      .catch(() => toast.error('Failed to load lists'))
      .finally(() => setLoadingLists(false));
  }, [selectedVendor]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setSelectedVendor('');
      setExistingLists([]);
      setListMode('existing');
      setSelectedList('');
      setNewListName('');
      setRunDate(new Date().toISOString().slice(0, 10));
      setRunLabel('');
      setFile(null);
      setUploading(false);
    }
  }, [isOpen]);

  const handleFileChange = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const validExt = f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls');
    if (!validExt) { toast.error('Please select a CSV or Excel file'); e.target.value = ''; return; }
    if (f.size > 30 * 1024 * 1024) { toast.error('File too large (max 30 MB)'); e.target.value = ''; return; }
    setFile(f);
  };

  const resolvedListName = listMode === 'new' ? newListName.trim() : selectedList;

  const handleUpload = async () => {
    if (!selectedVendor) { toast.error('Please select a data vendor'); return; }
    if (!resolvedListName) {
      toast.error(listMode === 'new' ? 'Please enter a list name' : 'Please select or create a list');
      return;
    }
    if (!file) { toast.error('Please select a CSV / Excel file'); return; }

    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await axios.post('/api/data-vendor-uploads/upload', {
        fileData: base64,
        fileName: file.name,
        vendorId: selectedVendor,
        listName: resolvedListName,
        runDate,
        runLabel
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'Upload successful');
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl">
              <FileSpreadsheet size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Upload Vendor Data</h2>
              <p className="text-xs text-gray-500">Share a ViciDial run with a data vendor</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Vendor Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <Users size={14} className="inline mr-1.5 text-purple-500" />
              Data Vendor
            </label>
            {loadingVendors ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                <Loader size={14} className="animate-spin" /> Loading vendors...
              </div>
            ) : vendors.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No data vendor accounts found. Create one first via Admin → Create Data Vendor.
              </p>
            ) : (
              <select
                value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm font-medium transition-all"
              >
                <option value="">Select a data vendor…</option>
                {vendors.map(v => (
                  <option key={v._id} value={v._id}>{v.name} — {v.email}</option>
                ))}
              </select>
            )}
          </div>

          {/* List Selection */}
          {selectedVendor && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <List size={14} className="inline mr-1.5 text-purple-500" />
                List Name
              </label>

              {loadingLists ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader size={14} className="animate-spin" /> Loading lists…
                </div>
              ) : (
                <>
                  {existingLists.length > 0 && (
                    <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden mb-3">
                      <button
                        type="button"
                        onClick={() => setListMode('existing')}
                        className={`flex-1 py-2 text-xs font-bold transition-all ${listMode === 'existing' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >
                        Select Existing List
                      </button>
                      <button
                        type="button"
                        onClick={() => setListMode('new')}
                        className={`flex-1 py-2 text-xs font-bold transition-all ${listMode === 'new' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >
                        <Plus size={12} className="inline mr-1" />
                        Add New List
                      </button>
                    </div>
                  )}

                  {listMode === 'existing' && existingLists.length > 0 ? (
                    <select
                      value={selectedList}
                      onChange={e => setSelectedList(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm font-medium transition-all"
                    >
                      <option value="">Choose a list…</option>
                      {existingLists.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={newListName}
                        onChange={e => setNewListName(e.target.value)}
                        placeholder="e.g. July Campaign 1, June Leads Batch A…"
                        className="w-full px-3 py-2.5 border-2 border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm font-medium transition-all"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This name will appear in the vendor's dashboard for all runs of this list.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Run Date + Label */}
          {selectedVendor && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <Calendar size={14} className="inline mr-1.5 text-purple-500" />
                  Run Date
                </label>
                <input
                  type="date"
                  value={runDate}
                  onChange={e => setRunDate(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm font-medium transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <Tag size={14} className="inline mr-1.5 text-purple-500" />
                  Run Label <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={runLabel}
                  onChange={e => setRunLabel(e.target.value)}
                  placeholder="e.g. Morning Run, 2nd Call…"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm font-medium transition-all"
                />
              </div>
            </div>
          )}

          {/* File Upload */}
          {selectedVendor && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <Upload size={14} className="inline mr-1.5 text-purple-500" />
                ViciDial CSV File
              </label>
              <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                file ? 'border-purple-400 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
              }`}>
                <div className="flex flex-col items-center gap-1.5">
                  {file ? (
                    <>
                      <FileSpreadsheet size={22} className="text-purple-500" />
                      <span className="text-sm font-semibold text-purple-700">{file.name}</span>
                      <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    </>
                  ) : (
                    <>
                      <Upload size={22} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">Click to select CSV / XLSX file</span>
                      <span className="text-xs text-gray-400">Max 30 MB</span>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedVendor || !resolvedListName || !file}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/25"
          >
            {uploading ? (
              <><Loader size={15} className="animate-spin" /> Uploading…</>
            ) : (
              <><Upload size={15} /> Upload Run</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataVendorShareModal;
