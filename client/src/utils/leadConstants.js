/**
 * Shared constants and formatters for Lead Modals and Dashboards
 * Used by WebsiteLeadsModal, BenWebsiteLeadsModal, InboundDataModal, etc.
 */

export const STATUS_COLORS = {
  new:      'bg-blue-100 text-blue-800',
  reviewed: 'bg-yellow-100 text-yellow-800',
  imported: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export const FORM_LABELS = {
  'contact-form':   { label: 'Contact Form',    color: 'bg-purple-100 text-purple-800' },
  'qualify-form':   { label: 'Qualify Form',    color: 'bg-teal-100 text-teal-800' },
  'live-transfer':  { label: '⚡ Live Transfer', color: 'bg-amber-100 text-amber-900 border border-amber-300' },
  'inbound-call':   { label: '📞 Inbound Call',  color: 'bg-indigo-100 text-indigo-900 border border-indigo-300' },
  'meta-lead-form': { label: 'Meta Lead Form',  color: 'bg-blue-100 text-blue-800' },
  'unknown':        { label: 'Webhook Lead',    color: 'bg-gray-100 text-gray-700' },
};

export const fmt = (v) => (v === undefined || v === null || v === '') ? '—' : v;

export const fmtDate = (d) => d ? new Date(d).toLocaleString('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}) : '—';

export const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';
