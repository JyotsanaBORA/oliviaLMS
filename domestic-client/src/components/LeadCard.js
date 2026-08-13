import React from 'react';
import { Phone, MapPin, Briefcase, Clock } from 'lucide-react';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const LeadCard = ({ lead, onOpen }) => {
  const isWorked   = lead.isWorked;

  const borderClass = isWorked
    ? 'border-l-4 border-blue-500 bg-blue-50 hover:bg-blue-100'
    : 'border-l-4 border-red-500 bg-red-50 hover:bg-red-100';

  const badgeClass = isWorked
    ? 'bg-blue-100 text-blue-800'
    : 'bg-red-100 text-red-800';

  const dotClass = isWorked
    ? 'bg-blue-500'
    : 'bg-red-500 animate-pulse';

  return (
    <div
      className={`rounded-xl p-4 cursor-pointer transition-colors shadow-sm ${borderClass}`}
      onClick={() => onOpen(lead)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Status dot */}
          <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />

          <div className="min-w-0">
            <p className="font-semibold text-gray-800 truncate">{lead.name || ''}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {lead.mobile}
              </span>
              {lead.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lead.city}
                </span>
              )}
              {lead.productType && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {lead.productType}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {fmtDate(lead.loadedAt || lead.createdAt)}
            </div>
          </div>
        </div>

        <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${badgeClass}`}>
          {isWorked ? 'WORKED' : 'PENDING'}
        </span>
      </div>

      {lead.domLead?.callOutcome && (
        <div className="mt-2 pl-5">
          <span className="text-xs text-gray-500">
            Outcome: <strong>{lead.domLead.callOutcome.replace(/_/g, ' ')}</strong>
          </span>
        </div>
      )}
    </div>
  );
};

export default LeadCard;

