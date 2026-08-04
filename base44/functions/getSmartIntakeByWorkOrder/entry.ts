import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const SOURCE_TYPE = 'LEGACY_PREDIAGNOSTICO';

function isActiveAccount(account) {
  if (!account) return false;
  if (typeof account.status === 'string') return account.status === 'active';
  return account.active === true;
}

function errorResponse(status, code, error) {
  return Response.json({ error, code }, { status });
}

async function resolveEffectiveOrganization(base44, user) {
  const isSuperAdmin = user.is_super_admin === true || user.data?.is_super_admin === true;

  if (isSuperAdmin) {
    if (!user.impersonating_org_id) {
      return {
        error: 'SUPER_ADMIN debe seleccionar una organizacion antes de consultar Smart Intake',
        code: 'EFFECTIVE_ORGANIZATION_REQUIRED',
      };
    }

    return {
      orgId: user.impersonating_org_id,
      role: 'ORG_ADMIN',
      branchId: null,
    };
  }

  const orgHint = user.impersonating_org_id || user.organization_id || null;
  const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 10);
  const activeAccounts = (accounts || []).filter(isActiveAccount);

  let account = null;
  if (orgHint) {
    account = activeAccounts.find(candidate => candidate.organization_id === orgHint) || null;
  } else if (activeAccounts.length === 1) {
    account = activeAccounts[0];
  }

  if (!account) {
    return {
      error: 'No existe una cuenta activa para la organizacion seleccionada',
      code: 'CALLER_MEMBERSHIP_INACTIVE',
    };
  }

  return {
    orgId: account.organization_id,
    role: account.role,
    branchId: account.branch_id || null,
  };
}

function addMalformedWarning(warnings, field) {
  warnings.push({
    code: 'LEGACY_OPTIONAL_FIELD_MALFORMED',
    field,
    message: `El campo legacy ${field} tiene un formato inesperado y se omitio de forma segura`,
  });
}

function optionalString(record, field, warnings) {
  const value = record?.[field];
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  addMalformedWarning(warnings, field);
  return null;
}

function optionalBoolean(record, field, warnings) {
  const value = record?.[field];
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  addMalformedWarning(warnings, field);
  return false;
}

function optionalObject(record, field, warnings) {
  const value = record?.[field];
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  addMalformedWarning(warnings, field);
  return {};
}

function normalizeLifecycleState(record, warnings) {
  if (record?.estado === 'completado') return 'COMPLETED';
  if (record?.estado === 'borrador' || record?.estado == null) return 'DRAFT';

  addMalformedWarning(warnings, 'estado');
  return 'UNKNOWN';
}

function recordTimestamp(record) {
  for (const field of ['updated_date', 'updated_at', 'created_date', 'created_at']) {
    const parsed = Date.parse(record?.[field] || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function selectDeterministicLegacyRecord(records) {
  return [...records].sort((left, right) => {
    const timestampDelta = recordTimestamp(right) - recordTimestamp(left);
    if (timestampDelta !== 0) return timestampDelta;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  })[0];
}

function mapLegacyPreDiagnosticoToSmartIntake(legacy, workOrder, initialWarnings = []) {
  const warnings = [...initialWarnings];
  const lifecycleState = normalizeLifecycleState(legacy, warnings);
  const summary = optionalString(workOrder, 'diagnostico_resumido', warnings);

  const intake = {
    id: String(legacy.id),
    organizationId: optionalString(legacy, 'organization_id', warnings) || workOrder.organization_id,
    workOrderId: optionalString(legacy, 'orden_trabajo_id', warnings) || workOrder.id,
    sourceType: SOURCE_TYPE,
    lifecycleState,
    isDraft: lifecycleState === 'DRAFT',
    isCompleted: lifecycleState === 'COMPLETED',
    mainUse: optionalString(legacy, 'uso_principal', warnings),
    isCriticalEquipment: optionalBoolean(legacy, 'equipo_critico', warnings),
    mainReportedProblem: optionalString(legacy, 'problema_principal', warnings),
    conditionalAnswers: optionalObject(legacy, 'respuestas', warnings),
    dataRiskLevel: optionalString(legacy, 'riesgo_datos', warnings) || 'ninguno',
    physicalRiskLevel: optionalString(legacy, 'riesgo_fisico', warnings) || 'ninguno',
    riskObservations: optionalString(legacy, 'observaciones_riesgo', warnings),
    completedByUserId: optionalString(legacy, 'completado_por_user_id', warnings),
    completedAt: optionalString(legacy, 'completado_at', warnings),
    createdAt: optionalString(legacy, 'created_date', warnings)
      || optionalString(legacy, 'created_at', warnings),
    updatedAt: optionalString(legacy, 'updated_date', warnings)
      || optionalString(legacy, 'updated_at', warnings),
    summary,
    legacyReference: {
      entityName: 'PreDiagnostico',
      recordId: String(legacy.id),
      rawState: typeof legacy.estado === 'string' ? legacy.estado : null,
    },
  };

  return { intake, warnings };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return errorResponse(401, 'AUTHENTICATION_REQUIRED', 'No autenticado');
    }

    const { workOrderId } = await req.json();
    if (!workOrderId || typeof workOrderId !== 'string') {
      return errorResponse(400, 'WORK_ORDER_ID_REQUIRED', 'workOrderId es requerido');
    }

    const access = await resolveEffectiveOrganization(base44, user);
    if (access.error) {
      return errorResponse(403, access.code, access.error);
    }

    const workOrders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: workOrderId,
      organization_id: access.orgId,
    }, 1);
    const workOrder = workOrders?.[0] || null;
    if (!workOrder) {
      // Keep the public response indistinguishable for missing and cross-tenant
      // IDs, while preserving an internal audit signal for operations.
      try {
        const unscopedWorkOrders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
          id: workOrderId,
        }, 1);
        console.warn('[getSmartIntakeByWorkOrder] work order lookup denied', {
          organizationId: access.orgId,
          workOrderId,
          reason: unscopedWorkOrders?.[0] ? 'CROSS_TENANT' : 'NOT_FOUND',
        });
      } catch (auditError) {
        console.error('[getSmartIntakeByWorkOrder] lookup audit failed', auditError);
      }
      return errorResponse(404, 'WORK_ORDER_NOT_FOUND', 'Orden de trabajo no encontrada');
    }

    // Existing work-order reads are organization-scoped. This compatibility
    // sprint intentionally does not introduce a new branch policy.
    const legacyRecords = await base44.asServiceRole.entities.PreDiagnostico.filter({
      organization_id: access.orgId,
      orden_trabajo_id: workOrder.id,
    });

    if (!legacyRecords || legacyRecords.length === 0) {
      return Response.json({
        status: 'NOT_FOUND',
        intake: null,
        warnings: [],
      });
    }

    const warnings = [];
    const selectedLegacy = selectDeterministicLegacyRecord(legacyRecords);
    if (legacyRecords.length > 1) {
      const duplicateWarning = {
        code: 'DUPLICATE_LEGACY_PREDIAGNOSTICO',
        count: legacyRecords.length,
        selectedLegacyId: String(selectedLegacy.id),
        message: 'Se detectaron multiples PreDiagnostico; se selecciono deterministamente el mas reciente',
      };
      warnings.push(duplicateWarning);
      console.warn('[getSmartIntakeByWorkOrder] duplicate legacy records', {
        organizationId: access.orgId,
        workOrderId: workOrder.id,
        ...duplicateWarning,
      });
    }

    const mapped = mapLegacyPreDiagnosticoToSmartIntake(selectedLegacy, workOrder, warnings);
    return Response.json({
      status: mapped.warnings.length > 0 ? 'FOUND_WITH_WARNINGS' : 'FOUND',
      intake: mapped.intake,
      warnings: mapped.warnings,
    });
  } catch (error) {
    console.error('[getSmartIntakeByWorkOrder] unexpected failure', error);
    return errorResponse(
      500,
      'SMART_INTAKE_READ_FAILED',
      'No se pudo consultar Smart Intake',
    );
  }
});
