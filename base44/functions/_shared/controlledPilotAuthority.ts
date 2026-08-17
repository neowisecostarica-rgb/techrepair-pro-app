function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Persistent pilot authority is intentionally small and fail-closed. When the
 * mode bit is enabled, both identifiers must be present or no principal may
 * receive tenant authority.
 */
export function inspectControlledPilotConfiguration(organization) {
  if (organization?.controlled_pilot_mode !== true) {
    return { enabled: false, valid: true, operatorUserId: null, branchId: null };
  }

  const operatorUserId = cleanId(organization.controlled_pilot_operator_user_id);
  const branchId = cleanId(organization.controlled_pilot_branch_id);
  return {
    enabled: true,
    valid: Boolean(operatorUserId && branchId),
    operatorUserId,
    branchId,
  };
}

export function isControlledPilotOrganization(organization) {
  const configuration = inspectControlledPilotConfiguration(organization);
  return configuration.enabled && configuration.valid;
}

/** Pure decision helper used by the canonical authorization resolver. */
export function evaluateControlledPilotHumanAccess({ organization, user, account, isSuperAdmin = false }) {
  const configuration = inspectControlledPilotConfiguration(organization);
  if (!configuration.enabled) return { ok: true, pilotMode: false };
  if (!configuration.valid) {
    return {
      ok: false,
      status: 503,
      code: 'CONTROLLED_PILOT_CONFIGURATION_INVALID',
      error: 'La configuracion del piloto controlado es invalida; toda mutacion permanece bloqueada',
    };
  }
  if (isSuperAdmin) {
    return {
      ok: false,
      status: 403,
      code: 'CONTROLLED_PILOT_OPERATOR_REQUIRED',
      error: 'El superadmin no puede mutar una organizacion en piloto controlado',
    };
  }

  const exactOperator = user?.id === configuration.operatorUserId
    && account?.user_id === configuration.operatorUserId
    && account?.organization_id === organization?.id
    && account?.status === 'active'
    && account?.role === 'ORG_ADMIN';
  if (!exactOperator) {
    return {
      ok: false,
      status: 403,
      code: 'CONTROLLED_PILOT_OPERATOR_REQUIRED',
      error: 'Solo el operador designado puede actuar durante el piloto controlado',
    };
  }

  return {
    ok: true,
    pilotMode: true,
    operatorUserId: configuration.operatorUserId,
    branchId: configuration.branchId,
  };
}
