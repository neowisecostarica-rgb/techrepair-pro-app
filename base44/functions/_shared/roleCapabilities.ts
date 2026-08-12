export const AUTHORIZATION_PRESET_VERSION = 'TRP_MULTIUSER_V1';

export const TENANT_ROLES = Object.freeze([
  'ORG_ADMIN',
  'BRANCH_ADMIN',
  'TECHNICIAN',
  'SALES',
  'INVENTORY',
  'CUSTOMER_SERVICE',
]);

export const CAPABILITIES = Object.freeze([
  'ORG_ADMINISTRATION',
  'BRANCH_ADMINISTRATION',
  'USER_ADMINISTRATION',
  'RECEPTION_OPERATIONS',
  'CUSTOMER_READ_OPERATIONAL',
  'CUSTOMER_SERVICE_OPERATIONS',
  'TECHNICAL_WORK',
  'TECHNICAL_SUPERVISION',
  'TECHNICAL_ASSIGNMENT',
  'QUOTE_OPERATIONS',
  'SALE_OPERATIONS',
  'COMMERCIAL_READ',
  'FINANCIAL_READ',
  'INVENTORY_READ',
  'INVENTORY_OPERATIONS',
  'INVENTORY_ADMINISTRATION',
  'DELIVERY_OPERATIONS',
  'CRM_OPERATIONS',
  'AGENDA_OPERATIONS',
]);

const ROLE_CAPABILITY_PRESETS = Object.freeze({
  ORG_ADMIN: CAPABILITIES,
  BRANCH_ADMIN: [
    'BRANCH_ADMINISTRATION',
    'RECEPTION_OPERATIONS',
    'CUSTOMER_READ_OPERATIONAL',
    'CUSTOMER_SERVICE_OPERATIONS',
    'TECHNICAL_WORK',
    'TECHNICAL_SUPERVISION',
    'TECHNICAL_ASSIGNMENT',
    'QUOTE_OPERATIONS',
    'SALE_OPERATIONS',
    'COMMERCIAL_READ',
    'FINANCIAL_READ',
    'INVENTORY_READ',
    'INVENTORY_OPERATIONS',
    'INVENTORY_ADMINISTRATION',
    'DELIVERY_OPERATIONS',
    'CRM_OPERATIONS',
    'AGENDA_OPERATIONS',
  ],
  TECHNICIAN: [
    'CUSTOMER_READ_OPERATIONAL',
    'TECHNICAL_WORK',
    'COMMERCIAL_READ',
    'INVENTORY_READ',
    'INVENTORY_OPERATIONS',
  ],
  SALES: [
    'RECEPTION_OPERATIONS',
    'CUSTOMER_READ_OPERATIONAL',
    'CUSTOMER_SERVICE_OPERATIONS',
    'TECHNICAL_ASSIGNMENT',
    'QUOTE_OPERATIONS',
    'SALE_OPERATIONS',
    'COMMERCIAL_READ',
    'INVENTORY_READ',
    'DELIVERY_OPERATIONS',
    'CRM_OPERATIONS',
    'AGENDA_OPERATIONS',
  ],
  INVENTORY: [
    'CUSTOMER_READ_OPERATIONAL',
    'COMMERCIAL_READ',
    'INVENTORY_READ',
    'INVENTORY_OPERATIONS',
    'INVENTORY_ADMINISTRATION',
  ],
  CUSTOMER_SERVICE: [
    'RECEPTION_OPERATIONS',
    'CUSTOMER_READ_OPERATIONAL',
    'CUSTOMER_SERVICE_OPERATIONS',
    'COMMERCIAL_READ',
    'DELIVERY_OPERATIONS',
    'CRM_OPERATIONS',
    'AGENDA_OPERATIONS',
  ],
});

export function normalizeTenantRole(role) {
  if (role === 'SUPPORT') return 'CUSTOMER_SERVICE';
  return TENANT_ROLES.includes(role) ? role : null;
}

export function getRoleCapabilities(role) {
  const normalizedRole = normalizeTenantRole(role);
  return normalizedRole ? [...(ROLE_CAPABILITY_PRESETS[normalizedRole] || [])] : [];
}

export function getRoleScope(role) {
  const normalizedRole = normalizeTenantRole(role);
  if (!normalizedRole) return null;
  return normalizedRole === 'ORG_ADMIN' ? 'ORGANIZATION' : 'SINGLE_BRANCH';
}

export function roleHasCapability(role, capability) {
  return getRoleCapabilities(role).includes(capability);
}

export function isKnownCapability(capability) {
  return CAPABILITIES.includes(capability);
}

export function isKnownTenantRole(role) {
  return Boolean(normalizeTenantRole(role));
}

