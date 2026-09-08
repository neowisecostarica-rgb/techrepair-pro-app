export class BranchProtectionError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(message: string, code = 'BRANCH_PROTECTION_FAILED', status = 409, details = {}) {
    super(message);
    this.name = 'BranchProtectionError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeBranchName(value: unknown) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

export async function assertActiveBranch(base44: any, organizationId: string, branchId: string, options: any = {}) {
  if (!organizationId || !branchId) {
    throw new BranchProtectionError(
      options.message || 'La operacion requiere una sucursal activa.',
      options.code || 'ACTIVE_BRANCH_REQUIRED',
      options.status || 409,
    );
  }
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: organizationId,
    active: true,
  }, '-created_date', 1);
  const branch = branches?.[0] || null;
  if (!branch) {
    throw new BranchProtectionError(
      options.message || 'La sucursal no existe, no pertenece a la organizacion o esta inactiva.',
      options.code || 'BRANCH_INACTIVE',
      options.status || 409,
      { branch_id: branchId },
    );
  }
  return branch;
}
