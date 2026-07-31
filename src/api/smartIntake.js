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

  if (!result || !['FOUND', 'FOUND_WITH_WARNINGS', 'NOT_FOUND'].includes(result.status)) {
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

export function invalidateSmartIntake(queryClient, workOrderId) {
  if (!queryClient || !workOrderId) return Promise.resolve();
  return queryClient.invalidateQueries({
    queryKey: smartIntakeQueryKeys.byWorkOrder(workOrderId),
  });
}
