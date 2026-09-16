import React from 'react';
import { Zap, PhoneCall, PhoneIncoming, ArrowRight, TrendingUp, CheckCircle2, XCircle, Clock, Award, RefreshCw } from 'lucide-react';

/**
 * DidBreakdownTable
 * Renders a side-by-side comparative table for organizations with multiple DIDs,
 * showing call volumes, qualification status, and direct action to view that DID's dedicated table.
 */
const DidBreakdownTable = ({
  dids = [],
  liveTransferDid = null,
  liveTransferDids = [],
  inboundCallsDid = null,
  inboundCallsDids = [],
  loanFlipDid = null,
  loanFlipDids = [],
  byDidStats = [],
  onSelectDid,
}) => {
  if (!Array.isArray(dids) || dids.length <= 1) {
    return null;
  }

  // Create a fast lookup map for stats by DID
  const statsMap = {};
  if (Array.isArray(byDidStats)) {
    byDidStats.forEach(item => {
      if (item?._id) {
        statsMap[String(item._id)] = item;
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden mb-6 transition-all duration-300">
      <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wide uppercase text-white">
              Multi-DID Call & Status Breakdown
            </h3>
            <p className="text-xs text-indigo-200/80">
              Comparative call volume, status counts, and conversions per assigned DID.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-indigo-200 border border-white/15 self-start sm:self-auto">
          {dids.length} Active DIDs Configured
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">DID Number</th>
              <th className="py-3 px-4">Channel / Flow</th>
              <th className="py-3 px-4 text-center">Total Calls</th>
              <th className="py-3 px-4 text-center text-emerald-700">Qualified</th>
              <th className="py-3 px-4 text-center text-red-600">Disqualified</th>
              <th className="py-3 px-4 text-center text-amber-700">Pending</th>
              <th className="py-3 px-4 text-center text-purple-700">Sales</th>
              <th className="py-3 px-4 text-center">Conv. Rate</th>
              <th className="py-3 px-4 text-right">Segregated Table</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dids.map((did) => {
              const stat = statsMap[String(did)] || {};
              const total = Number(stat.total || 0);
              const qualified = Number(stat.qualified || 0);
              const disqualified = Number(stat.notQualified || 0);
              const pending = Number(stat.pending || 0);
              const sales = Number(stat.sales || 0);
              const convRate = qualified > 0 ? ((sales / qualified) * 100).toFixed(1) : '0.0';

              const isLiveTransfer = (liveTransferDids || []).includes(did) || did === liveTransferDid;
              const isInboundCall = (inboundCallsDids || []).includes(did) || did === inboundCallsDid;
              const isLoanFlip = (loanFlipDids || []).includes(did) || did === loanFlipDid;

              return (
                <tr key={did} className="hover:bg-indigo-50/40 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 border border-gray-200 text-gray-800">
                      {did}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    {isLiveTransfer ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        <Zap className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
                        Live Transfer
                      </span>
                    ) : isInboundCall ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                        <PhoneCall className="h-3.5 w-3.5 text-indigo-600" />
                        Inbound Calls
                      </span>
                    ) : isLoanFlip ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                        <RefreshCw className="h-3.5 w-3.5 text-purple-600" />
                        Loan Flip
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                        <PhoneIncoming className="h-3.5 w-3.5 text-slate-500" />
                        Inbound Line
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-center font-bold text-gray-900 text-sm">
                    {total.toLocaleString()}
                  </td>

                  <td className="py-3.5 px-4 text-center font-semibold text-emerald-700">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                      {qualified.toLocaleString()}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center font-semibold text-red-600">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-red-50 border border-red-200">
                      {disqualified.toLocaleString()}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center font-semibold text-amber-700">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                      {pending.toLocaleString()}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center font-bold text-purple-700">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200">
                      {sales.toLocaleString()}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center font-semibold text-gray-700">
                    {convRate}%
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectDid && onSelectDid(did)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150"
                      title={`Filter table and view dedicated leads for ${did}`}
                    >
                      <span>View Leads</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DidBreakdownTable;
