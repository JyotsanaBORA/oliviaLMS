import React, { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, FileText, Loader, Eye, RefreshCw } from 'lucide-react';
import api from '../utils/axios';
import toast from 'react-hot-toast';

const DOC_TYPES = [
  { key: 'aadhaar_front',  label: 'Aadhaar  Front',       required: true },
  { key: 'aadhaar_back',   label: 'Aadhaar  Back',        required: true },
  { key: 'pan_card',       label: 'PAN Card',              required: true },
  { key: 'salary_slip_1',  label: 'Salary Slip (Month 1)', required: false },
  { key: 'salary_slip_2',  label: 'Salary Slip (Month 2)', required: false },
  { key: 'salary_slip_3',  label: 'Salary Slip (Month 3)', required: false },
  { key: 'bank_statement', label: 'Bank Statement',        required: false },
  { key: 'form_16',        label: 'Form 16 / ITR',         required: false },
  { key: 'business_proof', label: 'Business Proof',        required: false },
  { key: 'other',          label: 'Other',                 required: false },
];

// Build a map keyed by docType from an array of doc objects
const buildMap = (docs) => {
  const m = {};
  (docs || []).forEach((d) => { if (d?.docType) m[d.docType] = d; });
  return m;
};

const DocumentUpload = ({ leadId, documents = [], onDocumentsChange }) => {
  const [uploading,   setUploading]   = useState({});
  // Own local map so ticks appear immediately without waiting for parent prop cycle
  const [uploadedMap, setUploadedMap] = useState(() => buildMap(documents));
  const inputRefs = useRef({});

  // Re-sync when the parent passes a fresh documents array (modal re-opened)
  useEffect(() => {
    setUploadedMap(buildMap(documents));
  }, [documents]);

  const handleFileChange = async (docType, file) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, [docType]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);

      const res = await api.post(
        `/domestic-api/uploads/${leadId}/document`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      if (res.data?.success) {
        const doc = res.data.document;
        // Update local map immediately  tick shows right away
        setUploadedMap((prev) => ({ ...prev, [docType]: doc }));
        toast.success(`${DOC_TYPES.find(d => d.key === docType)?.label} uploaded!`);
        onDocumentsChange && onDocumentsChange(doc, docType);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading((prev) => ({ ...prev, [docType]: false }));
      if (inputRefs.current[docType]) inputRefs.current[docType].value = '';
    }
  };

  const totalUploaded  = Object.keys(uploadedMap).length;
  const reqMissing     = DOC_TYPES.filter(d => d.required && !uploadedMap[d.key]).length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
        <p className="text-xs text-gray-500">JPEG  PNG  PDF  max 10 MB each</p>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="text-gray-600">{totalUploaded}/{DOC_TYPES.length} uploaded</span>
          {reqMissing > 0 && (
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {reqMissing} required missing
            </span>
          )}
          {reqMissing === 0 && totalUploaded > 0 && (
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Required docs 
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DOC_TYPES.map((doc) => {
          const uploaded    = uploadedMap[doc.key];
          const isUploading = uploading[doc.key];

          return (
            <div
              key={doc.key}
              className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                uploaded
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              {/* Left: icon + label */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  uploaded ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  {uploaded
                    ? <CheckCircle className="h-5 w-5 text-green-600" />
                    : <FileText   className="h-4 w-4 text-gray-400"  />
                  }
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${uploaded ? 'text-green-800' : 'text-gray-700'}`}>
                    {doc.label}
                    {doc.required && <span className="text-red-500 ml-0.5">*</span>}
                  </p>
                  {uploaded
                    ? <p className="text-xs text-green-600 truncate max-w-[140px]"> {uploaded.originalName}</p>
                    : <p className="text-xs text-gray-400">Not uploaded</p>
                  }
                </div>
              </div>

              {/* Right: action buttons */}
              <div className="flex-shrink-0 ml-2 flex items-center gap-1">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  className="hidden"
                  ref={(el) => { inputRefs.current[doc.key] = el; }}
                  onChange={(e) => handleFileChange(doc.key, e.target.files[0])}
                />

                {isUploading ? (
                  <Loader className="h-4 w-4 text-blue-500 animate-spin" />
                ) : uploaded ? (
                  <>
                    <a
                      href={uploaded.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors"
                    >
                      <Eye className="h-3 w-3" /> View
                    </a>
                    <button
                      type="button"
                      onClick={() => inputRefs.current[doc.key]?.click()}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" /> Replace
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRefs.current[doc.key]?.click()}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
                  >
                    <Upload className="h-3 w-3" /> Upload
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DocumentUpload;

