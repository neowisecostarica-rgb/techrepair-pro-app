const AUTHORIZED_ROLES_FOR_TARGET = Object.freeze({
  ASIGNADA: ['ORG_ADMIN', 'BRANCH_ADMIN'],
  EN_REVISION: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  DIAGNOSTICADA: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  COTIZADA: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  APROBADA: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  EN_REPARACION: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  PRUEBAS: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  FINALIZADA: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  ENTREGADA: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  CANCELADA: ['ORG_ADMIN', 'BRANCH_ADMIN'],
});

export function hasWorkOrderTargetAuthority({ targetStatus, role, isSuperAdmin = false }) {
  if (isSuperAdmin) return true;
  const allowed = AUTHORIZED_ROLES_FOR_TARGET[targetStatus];
  return !allowed || allowed.includes(role);
}

export function workOrderTargetRoles(targetStatus) {
  return [...(AUTHORIZED_ROLES_FOR_TARGET[targetStatus] || [])];
}
