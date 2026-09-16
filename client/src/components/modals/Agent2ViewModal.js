import React from 'react';
import { CheckCircle } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';

/**
 * Agent2 Lead Details View Modal
 */
const Agent2ViewModal = ({
  isOpen,
  onClose,
  selectedLead,
  onOpenEdit,
  onOpenUpdate,
  onRefreshLead,
  getCategoryBadge,
  getStatusBadge,
  formatEasternTimeForDisplay = (d) => d ? new Date(d).toLocaleString() : 'N/A'
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

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-white px-6 pt-6 pb-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Lead Details: {selectedLead.name}</h3>
                <p className="text-sm text-gray-500">Complete lead information</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Personal Information</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Name:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Email:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.email || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Phone:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.phone || 'N/A'}</span>
                  </div>
                  {selectedLead.alternatePhone && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Alternate Phone:</span>
                      <span className="ml-2 text-sm text-gray-900">{selectedLead.alternatePhone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Address Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Address Information</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Address:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.address || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">City:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.city || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">State:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.state || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Zipcode:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.zipcode || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Location:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.location || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Debt Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Debt Information</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Debt Category:</span>
                    <span className="ml-2 text-sm text-gray-900 capitalize">
                      {selectedLead.debtCategory || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Debt Types:</span>
                    <div className="ml-2 text-sm text-gray-900">
                      {Array.isArray(selectedLead.debtTypes) && selectedLead.debtTypes.length > 0 
                        ? (
                          <div className="space-y-1">
                            {selectedLead.debtTypes.map((debtType, index) => (
                              <div key={index}>
                                {debtType}
                              </div>
                            ))}
                          </div>
                        )
                        : selectedLead.source || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Total Debt Amount:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      {selectedLead.totalDebtAmount ? `$${selectedLead.totalDebtAmount.toLocaleString()}` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Number of Creditors:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.numberOfCreditors || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Monthly Debt Payment:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      {selectedLead.monthlyDebtPayment ? `$${selectedLead.monthlyDebtPayment.toLocaleString()}` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Credit Score Range:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.creditScoreRange || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Category:</span>
                    <span className="ml-2">{getCategoryBadge ? getCategoryBadge(selectedLead.category, selectedLead.completionPercentage) : selectedLead.category || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Status:</span>
                    <span className="ml-2">{getStatusBadge ? getStatusBadge(selectedLead.status) : <StatusBadge status={selectedLead.status} />}</span>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Additional Information</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Created By:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedLead.createdBy?.name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Created At:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      {selectedLead.createdAt ? formatEasternTimeForDisplay(selectedLead.createdAt, { includeTime: false }) : 'N/A'}
                    </span>
                  </div>
                  {selectedLead.lastUpdatedBy && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Last Updated By:</span>
                      <span className="ml-2 text-sm text-gray-900">{selectedLead.lastUpdatedBy}</span>
                    </div>
                  )}
                  {selectedLead.lastUpdatedAt && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Last Updated:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {formatEasternTimeForDisplay(selectedLead.lastUpdatedAt)}
                      </span>
                    </div>
                  )}
                  {selectedLead.agent2LastAction && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Agent 2 Last Action:</span>
                      <span className="ml-2 text-sm font-semibold text-blue-700">
                        {selectedLead.agent2LastAction}
                      </span>
                    </div>
                  )}
                  {selectedLead.followUpDate && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Follow-up Date:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {formatEasternTimeForDisplay(selectedLead.followUpDate, { includeTime: false })}
                        {selectedLead.followUpTime && ` at ${selectedLead.followUpTime}`}
                      </span>
                    </div>
                  )}
                  {selectedLead.conversionValue && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Conversion Value:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        ${selectedLead.conversionValue.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-medium text-gray-600">Client ID:</span>
                    <span className="ml-2 text-sm font-mono font-semibold text-green-700">
                      {selectedLead.clientId || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lead Progress Status */}
            {selectedLead.leadProgressStatus && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Current Lead Progress Status</h4>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <CheckCircle className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-blue-800">
                        Status: <span className="font-bold">{selectedLead.leadProgressStatus}</span>
                      </p>
                      {selectedLead.lastUpdatedAt && (
                        <p className="text-xs text-blue-600 mt-1">
                          Updated: {formatEasternTimeForDisplay(selectedLead.lastUpdatedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Agent Status Information */}
            {(selectedLead.leadProgressStatus || selectedLead.leadStatus || selectedLead.contactStatus || selectedLead.qualificationOutcome || 
              selectedLead.callDisposition || selectedLead.engagementOutcome || selectedLead.disqualification) && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Agent Status Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedLead.leadProgressStatus && (
                    <div className="bg-blue-50 p-3 rounded-lg col-span-2">
                      <span className="text-sm font-medium text-gray-600">Lead Progress Status:</span>
                      <span className="ml-2 text-sm text-gray-900 font-semibold">
                        {selectedLead.leadProgressStatus}
                      </span>
                    </div>
                  )}
                  {selectedLead.leadStatus && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Lead Status:</span>
                      <span className="ml-2 text-sm text-gray-900 capitalize">
                        {selectedLead.leadStatus.replace('-', ' ')}
                      </span>
                    </div>
                  )}
                  {selectedLead.contactStatus && (
                    <div className="bg-green-50 p-3 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Contact Status:</span>
                      <span className="ml-2 text-sm text-gray-900 capitalize">
                        {selectedLead.contactStatus.replace('-', ' ')}
                      </span>
                    </div>
                  )}
                  {selectedLead.qualificationOutcome && (
                    <div className="bg-yellow-50 p-3 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Qualification:</span>
                      <span className="ml-2 text-sm text-gray-900 capitalize">
                        {selectedLead.qualificationOutcome.replace('-', ' ')}
                      </span>
                    </div>
                  )}
                  {selectedLead.callDisposition && (
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Call Disposition:</span>
                      <span className="ml-2 text-sm text-gray-900 capitalize">
                        {selectedLead.callDisposition.replace('-', ' ')}
                      </span>
                    </div>
                  )}
                  {selectedLead.engagementOutcome && (
                    <div className="bg-indigo-50 p-3 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Engagement:</span>
                      <span className="ml-2 text-sm text-gray-900 capitalize">
                        {selectedLead.engagementOutcome.replace('-', ' ')}
                      </span>
                    </div>
                  )}
                  {selectedLead.disqualification && (
                    <div className="bg-red-50 p-3 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Disqualification:</span>
                      <span className="ml-2 text-sm text-gray-900 capitalize">
                        {selectedLead.disqualification.replace('-', ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {(selectedLead.requirements || selectedLead.followUpNotes) && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Notes</h4>
                {selectedLead.requirements && (
                  <div className="bg-gray-50 p-4 rounded-lg mb-3">
                    <span className="text-sm font-medium text-gray-600 block mb-1">Initial Notes:</span>
                    <p className="text-sm text-gray-900">{selectedLead.requirements}</p>
                  </div>
                )}
                {selectedLead.followUpNotes && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <span className="text-sm font-medium text-gray-600 block mb-1">Follow-up Notes:</span>
                    <p className="text-sm text-gray-900">{selectedLead.followUpNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse">
            <button
              onClick={onOpenEdit}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Edit Lead Details
            </button>
            <button
              onClick={onOpenUpdate}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Update Status
            </button>
            <button
              onClick={onRefreshLead}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Agent2ViewModal;
