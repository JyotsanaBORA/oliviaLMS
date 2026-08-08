import React, { useState, useEffect } from 'react';
import { X, Upload, Users, FileSpreadsheet, Loader } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const AdminUploadShareModal = ({ isOpen, onClose }) => {
  const [restrictedAdmins, setRestrictedAdmins] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Fetch restricted admin list on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingAdmins(true);
    axios.get('/api/admin-uploads/restricted-admins')
      .then(res => {
        if (res.data?.success) setRestrictedAdmins(res.data.data);
      })
      .catch(() => toast.error('Failed to load restricted admins'))
      .finally(() => setLoadingAdmins(false));
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedAdmin('');
      setFile(null);
      setUploading(false);
    }
  }, [isOpen]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/csv'
    ];
    const isCSVExt = f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls');

    if (!validTypes.includes(f.type) && !isCSVExt) {
      toast.error('Please select a CSV or Excel file');
      e.target.value = '';
      return;
    }

    if (f.size > 20 * 1024 * 1024) {
      toast.error('File too large (max 20 MB)');
      e.target.value = '';
      return;
    }

    setFile(f);
  };

  const handleUpload = async () => {
    if (!selectedAdmin) {
      toast.error('Please select a restricted admin');
      return;
    }
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setUploading(true);
    try {
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await axios.post('/api/admin-uploads/upload', {
        fileData: base64,
        fileName: file.name,
        sharedWith: selectedAdmin
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'Upload successful');
        onClose();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center gap-2 text-white">
            <Upload size={20} />
            <h3 className="text-lg font-bold">Share Data with Restricted Admin</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Restricted Admin Select */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <Users size={14} />
              Select Restricted Admin
            </label>
            {loadingAdmins ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader size={14} className="animate-spin" />
                Loading...
              </div>
            ) : restrictedAdmins.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                No restricted admin users found. Create one first via organization management.
              </p>
            ) : (
              <select
                value={selectedAdmin}
                onChange={e => setSelectedAdmin(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">-- Select Restricted Admin --</option>
                {restrictedAdmins.map(a => (
                  <option key={a._id} value={a._id}>
                    {a.name} — {a.email}
                    {a.organization?.name ? ` (${a.organization.name})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <FileSpreadsheet size={14} />
              Upload CSV / Excel File
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer border-2 border-gray-200 rounded-lg"
              />
            </div>
            {file && (
              <p className="mt-2 text-xs text-gray-500">
                Selected: <span className="font-medium text-gray-700">{file.name}</span>{' '}
                ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedAdmin || !file}
            className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            {uploading ? (
              <>
                <Loader size={14} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload & Share
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminUploadShareModal;
