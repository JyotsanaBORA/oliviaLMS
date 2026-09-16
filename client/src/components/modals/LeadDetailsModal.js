import React from 'react';
import { Save, X, Edit3 } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';

/**
 * Lead Details and Admin Editing Modal
 */
const LeadDetailsModal = ({
  isOpen,
  onClose,
  selectedLead,
  isReddingtonAdmin = false,
  isEditing = false,
  isUpdating = false,
  editedLead = {},
  onEditToggle,
  onCancelEdit,
  onSave,
  onInputChange,
  leadProgressOptions = [],
  formatDisposedByLabel = (v) => v || '—',
  formatDraftDate = (d) => d ? new Date(d).toLocaleDateString() : '—',
  getCategoryBadge,
  getQualificationBadge,
  getStatusBadge,
  formatEasternTimeForDisplay = (d) => d ? new Date(d).toLocaleString() : '—'
}) => {
  if (!isOpen || !selectedLead) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div 
            className="absolute inset-0 bg-gray-500 opacity-75"
            onClick={onClose}
          ></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {isReddingtonAdmin && isEditing ? 'Edit Lead' : 'Lead Details'}: {selectedLead.name}
                </h3>
                <p className="text-blue-100 text-sm">
                  {isReddingtonAdmin && isEditing ? 'Modify lead information and status' : 'Complete lead information and tracking'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isReddingtonAdmin && (
                  <>
                    {isEditing ? (
                      <>
                        <button
                          onClick={onSave}
                          disabled={isUpdating}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={onCancelEdit}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={onEditToggle}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={onClose}
                  className="text-white hover:text-blue-200 transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white px-6 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Personal Information */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-xl border border-gray-200">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg mr-3">
                    <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800">Personal Information</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Name:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="text"
                        value={editedLead.name || ''}
                        onChange={(e) => onInputChange('name', e.target.value)}
                        className="text-sm text-gray-900 font-medium text-right border border-gray-300 rounded px-2 py-1 w-32"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-900 text-right">{selectedLead.name}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Email:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="email"
                        value={editedLead.email || ''}
                        onChange={(e) => onInputChange('email', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-40"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.email || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Phone:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="tel"
                        value={editedLead.phone_number || ''}
                        onChange={(e) => onInputChange('phone_number', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.phone_number || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Alt. Phone:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="tel"
                        value={editedLead.alternatePhone || ''}
                        onChange={(e) => onInputChange('alternatePhone', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.alternatePhone || '—'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-green-100 rounded-lg mr-3">
                    <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800">Address Information</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Address:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <textarea
                        value={editedLead.address || ''}
                        onChange={(e) => onInputChange('address', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-40 h-16 resize-none"
                        placeholder="Enter address"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right max-w-xs">{selectedLead.address || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">City:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="text"
                        value={editedLead.city || ''}
                        onChange={(e) => onInputChange('city', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                        placeholder="Enter city"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.city || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">State:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="text"
                        value={editedLead.state || ''}
                        onChange={(e) => onInputChange('state', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-24"
                        placeholder="Enter state"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.state || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Zipcode:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="text"
                        value={editedLead.zipcode || ''}
                        onChange={(e) => onInputChange('zipcode', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-24"
                        placeholder="Enter zipcode"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.zipcode || '—'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Debt Information */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border border-purple-200">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg mr-3">
                    <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800">Debt Information</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Debt Category:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <select
                        value={editedLead.debtCategory || ''}
                        onChange={(e) => onInputChange('debtCategory', e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-28"
                      >
                        <option value="">Select</option>
                        <option value="unsecured">Unsecured</option>
                        <option value="secured">Secured</option>
                      </select>
                    ) : (
                      <span className="text-sm text-gray-900 text-right capitalize">{selectedLead.debtCategory || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Source:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="text"
                        value={editedLead.source || ''}
                        onChange={(e) => onInputChange('source', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                        placeholder="Lead source"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.source || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Total Amount:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="number"
                        value={editedLead.totalDebtAmount || ''}
                        onChange={(e) => onInputChange('totalDebtAmount', parseInt(e.target.value) || 0)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                        placeholder="0"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right font-semibold">
                        {selectedLead.totalDebtAmount ? `$${selectedLead.totalDebtAmount.toLocaleString()}` : '—'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Creditors:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="number"
                        value={editedLead.numberOfCreditors || ''}
                        onChange={(e) => onInputChange('numberOfCreditors', parseInt(e.target.value) || 0)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-20"
                        placeholder="0"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.numberOfCreditors || '—'}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Monthly Payment:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="number"
                        value={editedLead.monthlyDebtPayment || ''}
                        onChange={(e) => onInputChange('monthlyDebtPayment', parseInt(e.target.value) || 0)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                        placeholder="0"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">
                        {selectedLead.monthlyDebtPayment ? `$${selectedLead.monthlyDebtPayment.toLocaleString()}` : '—'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Credit Score:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <select
                        value={editedLead.creditScoreRange || ''}
                        onChange={(e) => onInputChange('creditScoreRange', e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                      >
                        <option value="">Select Range</option>
                        <option value="300-549">300-549 (Poor)</option>
                        <option value="550-649">550-649 (Fair)</option>
                        <option value="650-699">650-699 (Good)</option>
                        <option value="700-749">700-749 (Very Good)</option>
                        <option value="750-850">750-850 (Excellent)</option>
                      </select>
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.creditScoreRange || '—'}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* GTI Workflow Snapshot */}
            <div className="mt-6 bg-gradient-to-br from-indigo-50 to-indigo-100 p-5 rounded-xl border border-indigo-200">
              <h4 className="text-lg font-semibold text-gray-800 mb-4">GTI Workflow Snapshot</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-gray-600">Disposition Status:</span>
                  <p className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${selectedLead.isDisposed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {selectedLead.isDisposed ? 'Disposed' : 'Active'}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Disposition Reason:</span>
                  <p className="mt-1 text-sm text-gray-900 break-words">{selectedLead.disposition1 || '—'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Disposed By:</span>
                  <p className="mt-1 text-sm font-semibold text-purple-800">{formatDisposedByLabel(selectedLead.disposedBy || selectedLead.agent2LastAction || selectedLead.agentLastAction || selectedLead.lastUpdatedBy)}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Draft Date:</span>
                  <p className="mt-1 text-sm text-gray-900">{formatDraftDate(selectedLead.draftDate)}</p>
                </div>
              </div>
            </div>

            {/* Management & Status Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Management Information */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl border border-orange-200">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-orange-100 rounded-lg mr-3">
                    <svg className="h-5 w-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800">Management Info</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Created By:</span>
                    <span className="text-sm text-gray-900 text-right font-medium">{selectedLead.createdBy?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Created At:</span>
                    <span className="text-sm text-gray-900 text-right">
                      {selectedLead.createdAt ? new Date(selectedLead.createdAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Category:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <select
                        value={editedLead.category || ''}
                        onChange={(e) => onInputChange('category', e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-24"
                      >
                        <option value="">Select</option>
                        <option value="hot">Hot</option>
                        <option value="warm">Warm</option>
                        <option value="cold">Cold</option>
                      </select>
                    ) : (
                      <div className="text-right">{getCategoryBadge ? getCategoryBadge(selectedLead.category, selectedLead.completionPercentage) : selectedLead.category || '—'}</div>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Qualification:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <div className="text-right">
                        <select
                          value={editedLead.qualificationStatus || ''}
                          onChange={(e) => onInputChange('qualificationStatus', e.target.value)}
                          className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                        >
                          <option value="">Select Status</option>
                          <option value="qualified">Qualified</option>
                          <option value="not-qualified">Not - Qualified</option>
                          <option value="pending">Pending</option>
                        </select>
                        <div className="text-xs text-blue-600 italic mt-1">Independent from Lead Progress</div>
                      </div>
                    ) : (
                      <div className="text-right">{getQualificationBadge ? getQualificationBadge(selectedLead.qualificationStatus) : <StatusBadge status={selectedLead.qualificationStatus} />}</div>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Status:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <select
                        value={editedLead.status || ''}
                        onChange={(e) => onInputChange('status', e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                      >
                        <option value="">Select Status</option>
                        <option value="new">New</option>
                        <option value="interested">Interested</option>
                        <option value="not-interested">Not Interested</option>
                        <option value="successful">Successful</option>
                        <option value="follow-up">Follow-up</option>
                      </select>
                    ) : (
                      <div className="text-right">{getStatusBadge ? getStatusBadge(selectedLead.status) : <StatusBadge status={selectedLead.status} />}</div>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="text"
                        value={editedLead.company || ''}
                        onChange={(e) => onInputChange('company', e.target.value)}
                        className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                        placeholder="Company name"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">{selectedLead.company || ''}</span>
                    )}
                  </div>
                  {isReddingtonAdmin && selectedLead.lastUpdatedBy && (
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-gray-600">Updated By:</span>
                      <span className="text-sm text-green-700 text-right font-medium">{selectedLead.lastUpdatedBy}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Agent2 Status Tracking */}
              <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-5 rounded-xl border border-teal-200">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-teal-100 rounded-lg mr-3">
                    <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800">Agent2 Actions & Status</h4>
                  {isReddingtonAdmin && isEditing && (
                    <p className="text-xs text-blue-600 italic">Note: Lead Progress Status and Qualification Status are independent fields</p>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded-lg border border-teal-200 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-gray-600">Lead Progress Status:</span>
                      {isReddingtonAdmin && isEditing ? (
                        <select
                          value={editedLead.leadProgressStatus || ''}
                          onChange={(e) => onInputChange('leadProgressStatus', e.target.value)}
                          className="text-sm border border-gray-300 rounded px-2 py-1 w-48"
                        >
                          <option value="">Select Status</option>
                          {leadProgressOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        selectedLead.leadProgressStatus ? (
                          <span className="text-sm bg-teal-100 text-teal-800 px-2 py-1 rounded-full font-medium text-right max-w-xs">
                            {selectedLead.leadProgressStatus}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500 italic">No status update yet</span>
                        )
                      )}
                    </div>
                    {(selectedLead.disposedBy || selectedLead.agent2LastAction || selectedLead.agentLastAction || selectedLead.lastUpdatedBy) && (
                      <div className="flex justify-between items-start pt-1 border-t border-teal-100">
                        <span className="text-sm font-medium text-gray-600">Disposed / Handled By:</span>
                        <span className="text-sm text-purple-700 font-semibold text-right">
                          {formatDisposedByLabel(selectedLead.disposedBy || selectedLead.agent2LastAction || selectedLead.agentLastAction || selectedLead.lastUpdatedBy)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Follow-up Date:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="date"
                        value={editedLead.followUpDate ? new Date(editedLead.followUpDate).toISOString().split('T')[0] : ''}
                        onChange={(e) => onInputChange('followUpDate', e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">
                        {selectedLead.followUpDate ? new Date(selectedLead.followUpDate).toLocaleDateString() : '—'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Follow-up Time:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="time"
                        value={editedLead.followUpTime || ''}
                        onChange={(e) => onInputChange('followUpTime', e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 text-right">
                        {selectedLead.followUpTime || '—'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Client ID:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="text"
                        value={editedLead.clientId || ''}
                        onChange={(e) => onInputChange('clientId', e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-40 font-mono"
                        placeholder="e.g. ABC123"
                      />
                    ) : (
                      <span className="text-sm text-green-700 font-mono font-semibold text-right">
                        {selectedLead.clientId || '—'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-600">Conversion Value:</span>
                    {isReddingtonAdmin && isEditing ? (
                      <input
                        type="number"
                        value={editedLead.conversionValue || ''}
                        onChange={(e) => onInputChange('conversionValue', parseInt(e.target.value) || 0)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                        placeholder="0"
                      />
                    ) : (
                      <span className="text-sm text-green-600 text-right font-semibold">
                        {selectedLead.conversionValue ? `$${selectedLead.conversionValue.toLocaleString()}` : '—'}
                      </span>
                    )}
                  </div>
                  
                  {isReddingtonAdmin && selectedLead.lastUpdatedBy && (
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-gray-600">Last Updated By:</span>
                      <span className="text-sm text-teal-700 text-right font-medium">{selectedLead.lastUpdatedBy}</span>
                    </div>
                  )}
                  
                  {selectedLead.lastUpdatedAt && (
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-gray-600">Last Updated At:</span>
                      <span className="text-sm text-gray-900 text-right">
                        {formatEasternTimeForDisplay(selectedLead.lastUpdatedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notes & Comments Section */}
            <div className="mt-6">
              <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-4 rounded-xl">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <svg className="h-5 w-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Notes & Comments
                </h4>
                
                <div className="space-y-4">
                  {/* Agent1 Notes */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center mb-2">
                      <span className="text-sm font-semibold text-blue-800">Agent1 Notes:</span>
                    </div>
                    {isReddingtonAdmin && isEditing ? (
                      <textarea
                        value={editedLead.notes || ''}
                        onChange={(e) => onInputChange('notes', e.target.value)}
                        className="w-full text-sm text-gray-900 border border-blue-300 rounded px-3 py-2 h-20 resize-none"
                        placeholder="Enter Agent1 notes..."
                      />
                    ) : (
                      <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.notes || 'No notes available'}</p>
                    )}
                  </div>
                  
                  {/* Assignment Notes */}
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <div className="flex items-center mb-2">
                      <span className="text-sm font-semibold text-purple-800">Assignment Notes:</span>
                    </div>
                    {isReddingtonAdmin && isEditing ? (
                      <textarea
                        value={editedLead.assignmentNotes || ''}
                        onChange={(e) => onInputChange('assignmentNotes', e.target.value)}
                        className="w-full text-sm text-gray-900 border border-purple-300 rounded px-3 py-2 h-20 resize-none"
                        placeholder="Enter assignment notes..."
                      />
                    ) : (
                      <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.assignmentNotes || 'No assignment notes available'}</p>
                    )}
                  </div>
                  
                  {/* Agent2 Follow-up Notes */}
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center mb-2">
                      <span className="text-sm font-semibold text-green-800">Agent2 Follow-up Notes:</span>
                    </div>
                    {isReddingtonAdmin && isEditing ? (
                      <textarea
                        value={editedLead.followUpNotes || ''}
                        onChange={(e) => onInputChange('followUpNotes', e.target.value)}
                        className="w-full text-sm text-gray-900 border border-green-300 rounded px-3 py-2 h-20 resize-none"
                        placeholder="Enter follow-up notes..."
                      />
                    ) : (
                      <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.followUpNotes || 'No follow-up notes available'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-3 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetailsModal;
