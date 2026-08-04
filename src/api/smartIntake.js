import { base44 } from '@/api/base44Client';

/**
 * @typedef {'LEGACY_PREDIAGNOSTICO'} SmartIntakeSourceType
 * @typedef {'DRAFT' | 'COMPLETED' | 'UNKNOWN'} SmartIntakeLifecycleState
 *
 * @typedef {Object} SmartIntakeDTO
 * @property {string} id
 * @property {string} organizationId
 * @property {string} workOrderId
 * @property {SmartIntakeSourceType} sourceType
 * @property {SmartIntakeLifecycleState} lifecycleState
 * @property {boolean} isDraft
 * @property {boolean} isCompleted
 * @property {string | null} mainUse
 * @property {boolean} isCriticalEquipment
 * @property {string | null} mainReportedProblem
 * @property {Record<string, unknown>} conditionalAnswers
 * @property {string} dataRiskLevel
 * @property {string} physicalRiskLevel
 * @property {string | null} riskObservations
 * @property {string | null} completedByUserId
 * @property {string | null} completedAt
 * @property {string | null} createdAt
 * @property {string | null} updatedAt
 * @property {string | null} summary
 * @property {{ entityName: 'PreDiagnostico', recordId: string, rawState: string | null }} legacyReference
 */

export const smartIntakeQueryKeys = {
  all: ['smart-intake'],
  byWorkOrder: workOrderId => ['smart-intake', 'work-order', workOrderId],
};

/**
 * Authoritative Smart Intake read path. Persistence selection and tenant
 * authorization remain backend-owned.
 *
 * @param {string} workOrderId
 * @returns {Promise<{status: 'FOUND' | 'FOUND_WITH_WARNINGS' | 'NOT_FOUND', intake: SmartIntakeDTO | null, warnings: Array<object>} >}
 */
export async function getSmartIntakeByWorkOrder(workOrderId) {
  if (!workOrderId || typeof workOrderId !== 'string') {
    throw new Error('workOrderId es requerido para consultar Smart Intake');
  }

  const response = await base44.functions.invoke('getSmartIntakeByWorkOrder', { workOrderId });
  const result = response?.data;

  const isKnownStatus = result
    && ['FOUND', 'FOUND_WITH_WARNINGS', 'NOT_FOUND'].includes(result.status);
  const hasValidWarnings = result?.warnings == null || Array.isArray(result.warnings);
  const hasValidIntake = result?.status === 'NOT_FOUND'
    ? result.intake == null
    : !!result?.intake && typeof result.intake === 'object' && !Array.isArray(result.intake);

  if (!isKnownStatus || !hasValidWarnings || !hasValidIntake) {
    throw new Error('Respuesta invalida del servicio Smart Intake');
  }

  if (result.warnings?.length > 0) {
    console.warn('[SmartIntake] compatibility warnings', {
      workOrderId,
      warnings: result.warnings,
    });
  }

  return {
    status: result.status,
    intake: result.intake || null,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  };
}

/**
 * Legacy write bridge. The backend remains the only authority that selects a
 * duplicate; the wizard then loads that exact legacy record for editing.
 *
 * @param {string} workOrderId
 * @param {string} organizationId
 * @returns {Promise<object | null>}
 */
export async function getLegacyPreDiagnosticoForEditing(workOrderId, organizationId) {
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('organizationId es requerido para editar PreDiagnostico');
  }

  const result = await getSmartIntakeByWorkOrder(workOrderId);
  if (result.status === 'NOT_FOUND') return null;

  const legacyRecordId = result.intake?.legacyReference?.recordId;
  if (!legacyRecordId) {
    throw new Error('Smart Intake no contiene una referencia legacy editable');
  }

  const records = await base44.entities.PreDiagnostico.filter({
    id: legacyRecordId,
    organization_id: organizationId,
    orden_trabajo_id: workOrderId,
  });
  return records?.[0] || null;
}

export function invalidateSmartIntake(queryClient, workOrderId) {
  if (!queryClient || !workOrderId) return Promise.resolve();
  return queryClient.invalidateQueries({
    queryKey: smartIntakeQueryKeys.byWorkOrder(workOrderId),
  });
}
