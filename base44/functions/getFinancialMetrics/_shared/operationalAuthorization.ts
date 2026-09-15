const ALL_OPERATIONAL_ROLES = [
  'ORG_ADMIN',
  'BRANCH_ADMIN',
  'TECHNICIAN',
  'SALES',
  'INVENTORY',
  'CUSTOMER_SERVICE',
];

const ADMIN_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN'];
const COMMERCIAL_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];
const INVENTORY_READ_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY'];

export function isOrganizationWideRole(role) {
  return role === 'ORG_ADMIN';
}

export function getCanonicalBranchScope(authorization) {
  if (!authorization?.ok) {
    return { ok: false, status: authorization?.status || 403, error: authorization?.error || 'No autorizado' };
  }
  if (authorization.pilotMode === true) {
    if (!authorization.pilotBranchId) {
      return { ok: false, status: 503, code: 'CONTROLLED_PILOT_CONFIGURATION_INVALID', error: 'El piloto no tiene una sucursal canonica valida' };
    }
    return { ok: true, organizationWide: false, branchId: authorization.pilotBranchId };
  }
  if (isOrganizationWideRole(authorization.role)) {
    return { ok: true, organizationWide: true, branchId: null };
  }
  const branchId = authorization.account?.branch_id || null;
  if (!branchId) {
    return {
      ok: false,
      status: 403,
      error: 'La membresia operacional no tiene una sucursal canonica asignada',
      code: 'OPERATIONAL_BRANCH_REQUIRED',
    };
  }
  return { ok: true, organizationWide: false, branchId };
}

export function validateRequestedBranch(branchScope, requestedBranchId) {
  if (!requestedBranchId || branchScope.organizationWide) return { ok: true };
  if (requestedBranchId !== branchScope.branchId) {
    return {
      ok: false,
      status: 403,
      code: 'OPERATIONAL_CROSS_BRANCH_DENIED',
      error: 'La sucursal solicitada no coincide con la membresia autorizada',
    };
  }
  return { ok: true };
}