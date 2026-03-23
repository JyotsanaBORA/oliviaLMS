const RAW_GTI_ORG_NAME = (process.env.REACT_APP_GTI_ORG_NAME || 'GTI').trim();
export const GTI_ORG_CANONICAL_NAME = RAW_GTI_ORG_NAME.toUpperCase();

export const normalizeOrgName = (name = '') => {
  if (typeof name !== 'string') {
    return '';
  }
  return name.trim().toUpperCase();
};

export const isGtiOrganization = (organization) => {
  if (!organization) {
    return false;
  }

  if (typeof organization === 'string') {
    return normalizeOrgName(organization) === GTI_ORG_CANONICAL_NAME;
  }

  if (typeof organization === 'object') {
    return normalizeOrgName(organization.name || organization.title || '') === GTI_ORG_CANONICAL_NAME;
  }

  return false;
};
