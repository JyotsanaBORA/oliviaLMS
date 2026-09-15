import React from 'react';
import { Layers } from 'lucide-react';
import { hasOrgFeature } from '../utils/orgPermissions';

/**
 * Dynamic Vendor Portal Button(s) Component.
 * Automatically renders dedicated portal buttons for tenant admins whose org has `hasVendorLeadPortal`,
 * as well as for Reddington admins to access any vendor portal dynamically.
 *
 * @param {Object} props
 * @param {Object} props.user - Currently authenticated user
 * @param {boolean} props.isReddingtonAdmin - Whether user is Reddington admin
 * @param {Array} props.organizations - List of all organizations (for Reddington admin)
 * @param {Object} props.portalBadges - Map of badges by orgId or slug
 * @param {Function} props.onOpenPortal - Callback (org) => void
 */
const VendorPortalButton = ({
  user,
  isReddingtonAdmin,
  organizations = [],
  portalBadges = {},
  onOpenPortal
}) => {
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return null;
  }

  // 1. Tenant Admin: single button for their own organization if portal is enabled
  if (!isReddingtonAdmin && user?.role === 'admin') {
    const userOrg = user?.organization;
    if (!userOrg || !hasOrgFeature(userOrg, 'hasVendorLeadPortal')) {
      return null;
    }

    const orgId = String(userOrg._id || userOrg.id || '');
    const badgeCount = portalBadges[orgId] || portalBadges.default || 0;
    const orgName = userOrg.name || 'Vendor';

    return (
      <button
        type="button"
        onClick={() => onOpenPortal(userOrg)}
        className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
        }}
        title={`View ${orgName} leads`}
      >
        <Layers className="w-4 h-4 text-indigo-100" />
        <span>{orgName} Leads</span>
        {badgeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    );
  }

  // 2. Reddington / SuperAdmin: render buttons for all active orgs that have hasVendorLeadPortal enabled
  if (isReddingtonAdmin || user?.role === 'superadmin') {
    const portalOrgs = organizations.filter(org => org.isActive && hasOrgFeature(org, 'hasVendorLeadPortal'));

    if (portalOrgs.length === 0) return null;

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {portalOrgs.map((org) => {
          const orgId = String(org._id || org.id);
          const badgeCount = portalBadges[orgId] || 0;
          const orgName = org.name;

          // Distinct color accents for known partners or fallback gradient
          let bgStyle = {
            background: 'linear-gradient(135deg, #4f46e5, #4338ca)',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
          };
          if (orgName.toLowerCase().includes('truclick')) {
            bgStyle = { background: 'linear-gradient(135deg,#0284c7,#0369a1)', boxShadow: '0 4px 12px rgba(2,132,199,0.35)' };
          } else if (orgName.toLowerCase().includes('2')) {
            bgStyle = { background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', boxShadow: '0 4px 12px rgba(139,92,246,0.35)' };
          } else if (orgName.toLowerCase().includes('3')) {
            bgStyle = { background: 'linear-gradient(135deg,#ec4899,#db2777)', boxShadow: '0 4px 12px rgba(236,72,153,0.35)' };
          } else if (orgName.toLowerCase().includes('4')) {
            bgStyle = { background: 'linear-gradient(135deg,#0d9488,#0f766e)', boxShadow: '0 4px 12px rgba(13,148,136,0.35)' };
          }

          return (
            <button
              key={orgId}
              type="button"
              onClick={() => onOpenPortal(org)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
              style={bgStyle}
              title={`View ${orgName} leads`}
            >
              <Layers className="w-3.5 h-3.5 text-white/90" />
              <span>{orgName} Leads</span>
              {badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return null;
};

export default VendorPortalButton;
