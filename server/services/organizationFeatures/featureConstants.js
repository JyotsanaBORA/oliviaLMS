/**
 * Organization Feature Constants & Definitions
 * Dedicated configuration for organization feature flags and permissions.
 */

const DEFAULT_ORG_FEATURES = Object.freeze({
  hasLiveTransfer: false,     // Enables Live Transfer DID routing and classifies calls as 'live-transfer'
  hasInboundCalls: false,     // Enables direct Inbound Calls DID routing and classifies calls as 'inbound-call'
  hasDualDidSwitcher: false,  // Enables the sliding dual-channel switcher (All Calls / Live Transfers / Inbound Calls)
  hasVendorLeadPortal: false, // Enables dedicated vendor leads portal modal & mirroring to BenWebsiteLead
  hasOutboundData: false,     // Enables the Outbound Data / Vendor Dashboard tab in the navigation bar
  canDownloadCsv: false,      // Allows organization admin users to export and download leads as CSV
});

const FEATURE_METADATA = Object.freeze({
  hasLiveTransfer: {
    key: 'hasLiveTransfer',
    label: '⚡ Live Transfers',
    description: 'Enables dedicated Live Transfer DID and classifies matching inbound calls as live-transfer.',
    category: 'channels'
  },
  hasInboundCalls: {
    key: 'hasInboundCalls',
    label: '📞 Inbound Calls',
    description: 'Enables direct Inbound Calls DID and classifies matching calls as inbound-call.',
    category: 'channels'
  },
  hasDualDidSwitcher: {
    key: 'hasDualDidSwitcher',
    label: '🎛️ Dual-DID Segregated Dashboard Switcher',
    description: 'Displays sliding switcher (All Calls / Live Transfers / Inbound Calls) on the admin dashboard.',
    category: 'dashboard'
  },
  hasVendorLeadPortal: {
    key: 'hasVendorLeadPortal',
    label: '📋 Dedicated Vendor Leads Portal',
    description: 'Enables dedicated real-time vendor leads modal (like Jake / TruClick) and mirrors calls to BenWebsiteLead.',
    category: 'portals'
  },
  hasOutboundData: {
    key: 'hasOutboundData',
    label: '📊 Outbound / Vendor Data Access',
    description: 'Enables access to the Outbound Data / Vendor Dashboard menu item in the navigation bar.',
    category: 'dashboard'
  },
  canDownloadCsv: {
    key: 'canDownloadCsv',
    label: '📥 Allow CSV Lead Export',
    description: 'Permits organisation admin users to export and download lead reports as CSV.',
    category: 'permissions'
  }
});

module.exports = {
  DEFAULT_ORG_FEATURES,
  FEATURE_METADATA
};
