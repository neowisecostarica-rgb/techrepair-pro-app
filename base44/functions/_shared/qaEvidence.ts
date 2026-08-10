function timestampOf(record) {
  return Date.parse(record?.recorded_at || record?.created_date || record?.created_at || '');
}

export function evaluateCurrentQaEvidence(records, context) {
  const cycleStartedAt = Date.parse(context.cycleStartedAt || '');
  const now = Number.isFinite(context.now) ? context.now : Date.now();
  const currentCycle = (records || [])
    .filter(record =>
      record?.organization_id === context.organizationId &&
      record?.orden_trabajo_id === context.workOrderId &&
      record?.qa_cycle_id === context.cycleId &&
      record?.qa_cycle_started_at === context.cycleStartedAt &&
      record?.tecnico_id === context.assignedTechnicianId &&
      record?.author_user_id === context.assignedTechnicianId &&
      record?.author_role === 'TECHNICIAN' &&
      record?.recorded_via_backend === true &&
      Number.isFinite(timestampOf(record)) &&
      Number.isFinite(cycleStartedAt) &&
      timestampOf(record) >= cycleStartedAt &&
      timestampOf(record) <= now
    )
    .sort((left, right) => timestampOf(left) - timestampOf(right));

  const lastSuccessIndex = currentCycle.map(record => record.resultado).lastIndexOf('exitoso');
  if (lastSuccessIndex < 0) {
    return { valid: false, code: 'QA_SUCCESS_NOT_FOUND', evidence: currentCycle };
  }

  const incompatibleAfterSuccess = currentCycle
    .slice(lastSuccessIndex + 1)
    .some(record => record.resultado !== 'exitoso');
  if (incompatibleAfterSuccess) {
    return { valid: false, code: 'QA_LATER_INCOMPATIBLE_RESULT', evidence: currentCycle };
  }

  return { valid: true, code: 'QA_EVIDENCE_VALID', evidence: currentCycle };
}
