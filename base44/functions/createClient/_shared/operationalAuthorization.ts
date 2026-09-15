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
const CUSTOMER_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'CUSTOMER_SERVICE'];
const TECHNICAL_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'];
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

export async function resolveAuthorizedBranch(base44, authorization, requestedBranchId, options = {}) {
  const { allowSingleBranchFallback = false, required = true } = options;
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return branchScope;
  const branchCheck = validateRequestedBranch(branchScope, requestedBranchId);
  if (!branchCheck.ok) return branchCheck;

  let branchId = branchScope.organizationWide ? requestedBranchId || null : branchScope.branchId;
  if (!branchId && allowSingleBranchFallback) {
    const branches = await base44.asServiceRole.entities.Branch.filter({
      organization_id: authorization.organizationId,
      active: true,
    }, '-created_date', 2);
    if (branches?.length === 1) branchId = branches[0].id;
  }
  if (!branchId) {
    return required
      ? { ok: false, status: 400, code: 'OPERATIONAL_BRANCH_REQUIRED', error: 'La operacion requiere una sucursal autorizada' }
      : { ok: true, branchId: null, branchScope };
  }
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: authorization.organizationId,
    active: true,
  }, '-created_date', 1);
  if (!branches?.length) {
    return { ok: false, status: 403, code: 'OPERATIONAL_BRANCH_INVALID', error: 'La sucursal no pertenece a la organizacion autorizada' };
  }
  return { ok: true, branchId, branchScope };
}