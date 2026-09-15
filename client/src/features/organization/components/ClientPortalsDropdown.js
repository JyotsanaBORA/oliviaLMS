import React, { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown, Globe, PhoneIncoming, FileText, CheckCircle2, Shield } from 'lucide-react';
import { hasOrgFeature } from '../utils/orgPermissions';

/**
 * ClientPortalsDropdown
 * Consolidates all client & vendor lead portals into a clean, modern dropdown for Super/Reddington Admins,
 * while rendering a single, direct 1-click button for tenant admins.
 * 
 * 100% non-breaking: calls the exact same modal triggers and displays the exact same badges.
 */
const ClientPortalsDropdown = ({
  user,
  isReddingtonAdmin,
  organizations = [],
  portalBadges = {},
  websiteLeadsBadge = 0,
  westlakeLeadsBadge = 0,
  socialUpLeadsBadge = 0,
  benLeadsBadge = 0,
  loopLeadsBadge = 0,
  canAccessLoopLeads = false,
  isWestlakeAdmin = false,
  isSocialUpAdmin = false,
  onOpenWebsiteLeads,
  onOpenWestlakeLeads,
  onOpenSocialUpLeads,
  onOpenBenLeads,
  onOpenLoopLeads,
  onOpenVendorPortal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return null;
  }

  // -------------------------------------------------------------------------
  // 1. TENANT ADMIN: Single dedicated 1-click button for their own organization
  // -------------------------------------------------------------------------
  if (!isReddingtonAdmin) {
    const userOrg = user?.organization;
    const orgName = (userOrg?.name || '').toLowerCase();

    // Check Westlake admin
    if (isWestlakeAdmin) {
      return (
        <button
          type="button"
          onClick={onOpenWestlakeLeads}
          className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
          style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', boxShadow: '0 4px 12px rgba(8,145,178,0.35)' }}
          title="View Westlake leads"
        >
          <Globe className="w-4 h-4" />
          <span>Westlake Leads</span>
          {westlakeLeadsBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
              {westlakeLeadsBadge > 99 ? '99+' : westlakeLeadsBadge}
            </span>
          )}
        </button>
      );
    }

    // Check Social Up Media (Jake 1) admin
    if (isSocialUpAdmin) {
      return (
        <button
          type="button"
          onClick={onOpenSocialUpLeads}
          className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
          style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 4px 12px rgba(99,102,241,0.35)' }}
          title="View Social Up Media leads"
        >
          <Layers className="w-4 h-4" />
          <span>Social Up Leads</span>
          {socialUpLeadsBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
              {socialUpLeadsBadge > 99 ? '99+' : socialUpLeadsBadge}
            </span>
          )}
        </button>
      );
    }

    // Check Ben admin
    if (orgName.includes('ben')) {
      return (
        <button
          type="button"
          onClick={onOpenBenLeads}
          className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
          style={{ background: 'linear-gradient(135deg,#f97316,#d97706)', boxShadow: '0 4px 12px rgba(249,115,22,0.35)' }}
          title="View Ben website leads"
        >
          <Globe className="w-4 h-4" />
          <span>Ben Website Leads</span>
          {benLeadsBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
              {benLeadsBadge > 99 ? '99+' : benLeadsBadge}
            </span>
          )}
        </button>
      );
    }

    // Check Dynamic Vendor Portal for tenant (Jake 2, 3, 4, TruClick, etc.)
    if (userOrg && hasOrgFeature(userOrg, 'hasVendorLeadPortal')) {
      const orgId = String(userOrg._id || userOrg.id || '');
      const badgeCount = portalBadges[orgId] || portalBadges.default || 0;
      const displayOrgName = userOrg.name || 'Vendor';

      return (
        <button
          type="button"
          onClick={() => onOpenVendorPortal(userOrg)}
          className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}
          title={`View ${displayOrgName} leads`}
        >
          <Layers className="w-4 h-4 text-indigo-100" />
          <span>{displayOrgName} Leads</span>
          {badgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </button>
      );
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // 2. REDDINGTON / SUPER ADMIN: Clean Unified Dropdown
  // -------------------------------------------------------------------------
  // Active partner organizations with vendor portal feature
  const portalOrgs = organizations.filter(org => org.isActive && hasOrgFeature(org, 'hasVendorLeadPortal'));

  // Calculate sum of all badges
  let totalBadges = Number(websiteLeadsBadge || 0) +
    Number(westlakeLeadsBadge || 0) +
    Number(benLeadsBadge || 0) +
    Number(loopLeadsBadge || 0);

  portalOrgs.forEach(org => {
    const orgId = String(org._id || org.id);
    totalBadges += Number(portalBadges[orgId] || 0);
  });

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
        style={{
          background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
          boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
        }}
        title="Access all client and vendor lead portals"
      >
        <Layers className="w-4 h-4 text-indigo-200" />
        <span>Client Portals</span>
        <ChevronDown className={`w-3.5 h-3.5 text-indigo-200 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        
        {totalBadges > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 shadow-sm animate-pulse">
            {totalBadges > 99 ? '99+' : totalBadges}
          </span>
        )}
      </button>

      {/* Dropdown Floating Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 ring-1 ring-black/5 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Client & Vendor Portals</span>
            {totalBadges > 0 && (
              <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                {totalBadges} unread
              </span>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto py-1">
            {/* 1. Website Form Leads */}
            <button
              type="button"
              onClick={() => { onOpenWebsiteLeads(); setIsOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-200/50">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <span>Website Form Leads</span>
              </div>
              {websiteLeadsBadge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                  {websiteLeadsBadge}
                </span>
              )}
            </button>

            {/* 2. Westlake Leads */}
            <button
              type="button"
              onClick={() => { onOpenWestlakeLeads(); setIsOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-200/50">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <span>Westlake Leads</span>
              </div>
              {westlakeLeadsBadge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                  {westlakeLeadsBadge}
                </span>
              )}
            </button>

            {/* Divider */}
            {portalOrgs.length > 0 && <div className="my-1 border-t border-gray-100" />}

            {/* 3. Dynamic Partner Portals (Social Up, Jake 2, 3, 4, TruClick, etc.) */}
            {portalOrgs.map((org) => {
              const orgId = String(org._id || org.id);
              const badgeCount = portalBadges[orgId] || 0;
              const orgName = org.name;

              // Color accents
              let dotColor = 'bg-indigo-500';
              let iconBg = 'bg-indigo-50 text-indigo-600 border-indigo-200/50';
              if (orgName.toLowerCase().includes('truclick')) {
                dotColor = 'bg-sky-500';
                iconBg = 'bg-sky-50 text-sky-600 border-sky-200/50';
              } else if (orgName.toLowerCase().includes('2')) {
                dotColor = 'bg-purple-500';
                iconBg = 'bg-purple-50 text-purple-600 border-purple-200/50';
              } else if (orgName.toLowerCase().includes('3')) {
                dotColor = 'bg-pink-500';
                iconBg = 'bg-pink-50 text-pink-600 border-pink-200/50';
              } else if (orgName.toLowerCase().includes('4')) {
                dotColor = 'bg-teal-500';
                iconBg = 'bg-teal-50 text-teal-600 border-teal-200/50';
              }

              return (
                <button
                  key={orgId}
                  type="button"
                  onClick={() => { onOpenVendorPortal(org); setIsOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${iconBg}`}>
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <span>{orgName} Leads</span>
                  </div>
                  {badgeCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Divider */}
            <div className="my-1 border-t border-gray-100" />

            {/* 4. Ben Website Leads */}
            <button
              type="button"
              onClick={() => { onOpenBenLeads(); setIsOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/50">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <span>Ben Website Leads</span>
              </div>
              {benLeadsBadge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                  {benLeadsBadge}
                </span>
              )}
            </button>

            {/* 5. MyDebt Review Leads */}
            {canAccessLoopLeads && (
              <button
                type="button"
                onClick={() => { onOpenLoopLeads(); setIsOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-200/50">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <span>MyDebt Review Leads</span>
                </div>
                {loopLeadsBadge > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                    {loopLeadsBadge}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPortalsDropdown;
