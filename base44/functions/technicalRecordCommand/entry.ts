import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';
import { pickProjection } from '../_shared/dataProjections.ts';
import {
  evaluateCommandPolicyWithShadow,
  ExecuteSovereignCommand,
  SovereignCommandError,
} from '../_shared/commandExecution.ts';

const RECORD_POLICIES = Object.freeze({
  Diagnostico: {
    fields: ['tipo_diagnostico', 'estado_diagnostico', 'conclusion_tecnica', 'resumen_cliente', 'nivel_riesgo', 'propuesta_precio_total', 'propuesta_precio_detalle', 'completed_at'],
    authority: 'TECHNICAL',
  },
  DiagnosticoTecnico: {
    fields: ['estado', 'tipo_intervencion', 'componentes_revisar', 'pruebas_realizadas', 'hallazgos', 'causa_probable', 'trabajo_recomendado', 'riesgos_no_reparar', 'tiempo_estimado_horas', 'repuestos_requeridos', 'fecha_inicio', 'bloqueado'],
    authority: 'TECHNICAL',
  },
  DiagnosticoDocumento: {
    fields: ['version', 'formato', 'url_documento', 'estado', 'emitido_at', 'snapshot_data', 'aprobacion_status', 'aprobacion_at', 'aprobacion_canal', 'anulado_at', 'canal_envio', 'enviado_at', 'metodo_aprobacion'],
    authority: 'TECHNICAL_OR_COMMERCIAL',
  },
  DiagnosticoEvidencia: {
    fields: ['tipo', 'url', 'contenido_texto', 'descripcion'],
    authority: 'TECHNICAL',
  },
  DiagnosticoResultado: {
    fields: ['categoria', 'descripcion_item', 'resultado', 'observaciones'],
    authority: 'TECHNICAL',
  },
  BloqueoTecnico: {
    fields: ['tipo_bloqueo', 'descripcion', 'estado', 'resuelto_at', 'resuelto_por'],
    authority: 'TECHNICAL',
  },
  NotaInterna: {
    fields: ['contenido', 'menciones', 'tipo'],
    authority: 'TECHNICAL',
  },
  RegistroTiempo: {
    fields: ['actividad', 'inicio', 'fin', 'duracion_minutos', 'tipo_actividad'],
    authority: 'TECHNICAL',
  },
});

const CHILD_ENTITIES = new Set(['DiagnosticoDocumento', 'DiagnosticoEvidencia', 'DiagnosticoResultado']);
const IMMUTABLE_RELATION_FIELDS = new Set([
  'organization_id', 'branch_id', 'orden_trabajo_id', 'diagnostico_id',
  'tecnico_id', 'autor_id', 'autor_nombre', 'enviado_por', 'cliente_id', 'equipo_id',
]);

function fail(error, status = 400, code = 'TECHNICAL_RECORD_INVALID') {
  return Response.json({ error, code }, { status });
}

async function exactlyOne(entity, query) {
  const rows = await entity.filter(query, '-created_date', 2);
  return rows?.length === 1 ? rows[0] : null;
}

async function resolveDiagnosticParent(base44, organizationId, diagnosticId) {
  if (!diagnosticId) return null;
  const [technical, legacy] = await Promise.all([
    exactlyOne(base44.asServiceRole.entities.DiagnosticoTecnico, { id: diagnosticId, organization_id: organizationId }),
    exactlyOne(base44.asServiceRole.entities.Diagnostico, { id: diagnosticId, organization_id: organizationId }),
  ]);
  if (technical && legacy) return null;
  return technical || legacy;
}

function changedImmutableRelationship(current, data = {}) {
  for (const field of IMMUTABLE_RELATION_FIELDS) {
    if (!Object.hasOwn(data, field)) continue;
    if ((data[field] ?? null) !== (current?.[field] ?? null)) return field;
  }
  return null;
}

function buildServerFields(entityName, workOrder, user, parent) {
  const fields = { organization_id: workOrder.organization_id };
  if (!CHILD_ENTITIES.has(entityName)) fields.orden_trabajo_id = workOrder.id;
  if (CHILD_ENTITIES.has(entityName)) fields.diagnostico_id = parent.id;
  if (['Diagnostico', 'DiagnosticoTecnico', 'BloqueoTecnico', 'RegistroTiempo'].includes(entityName)) fields.tecnico_id = user.id;
  if (entityName === 'Diagnostico') {
    fields.cliente_id = workOrder.cliente_id;
    fields.equipo_id = workOrder.equipo_id;
  }
  if (entityName === 'NotaInterna') {
    fields.autor_id = user.id;
    fields.autor_nombre = user.full_name || user.email || user.id;
  }
  if (entityName === 'DiagnosticoDocumento') fields.enviado_por = user.id;
  return fields;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return fail('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return fail('No autenticado', 401, 'AUTH_REQUIRED');
    const body = await req.json().catch(() => ({}));
    const entityName = String(body.entity || '');
    const operation = String(body.operation || '');
    const policy = RECORD_POLICIES[entityName];
    if (!policy || !['create', 'update'].includes(operation)) {
      return fail('Mutacion tecnica no soportada', 403, 'TECHNICAL_SOVEREIGN_WRITER_REQUIRED');
    }

    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) return fail(authorization.error, authorization.status, authorization.code || 'AUTHORIZATION_CONTEXT_INVALID');
    const entity = base44.asServiceRole.entities[entityName];
    const current = operation === 'update'
      ? await exactlyOne(entity, { id: body.id, organization_id: authorization.organizationId })
      : null;
    if (operation === 'update' && !current) return fail('Registro no encontrado', 404, 'TECHNICAL_RECORD_NOT_FOUND');

    const immutableChange = current ? changedImmutableRelationship(current, body.data || {}) : null;
    if (immutableChange) {
      return fail(`La relacion tecnica ${immutableChange} es inmutable`, 409, 'TECHNICAL_RELATIONSHIP_IMMUTABLE');
    }

    // Updates are authorized against the existing canonical graph. Proposed
    // relationship values never participate in the authorization decision.
    const relationshipSource = current || body.data || {};
    const parent = CHILD_ENTITIES.has(entityName)
      ? await resolveDiagnosticParent(base44, authorization.organizationId, relationshipSource.diagnostico_id)
      : null;
    if (CHILD_ENTITIES.has(entityName) && !parent) {
      return fail('El diagnostico padre no pertenece a la organizacion autorizada', 404, 'TECHNICAL_DIAGNOSTIC_PARENT_INVALID');
    }
    const workOrderId = parent?.orden_trabajo_id || relationshipSource.orden_trabajo_id || null;
    const workOrder = workOrderId
      ? await exactlyOne(base44.asServiceRole.entities.OrdenTrabajo, {
          id: workOrderId,
          organization_id: authorization.organizationId,
        })
      : null;
    if (!workOrder) return fail('Orden de trabajo no encontrada', 404, 'TECHNICAL_WORK_ORDER_INVALID');
    const branch = authorizeRecordBranch(authorization, workOrder.branch_id);
    if (!branch.ok) return fail(branch.error, branch.status, branch.code);

    const effectiveTechnician = workOrder.tecnico_asignado_id === user.id;
    const canonicalAuthorId = current?.tecnico_id
      || (entityName === 'NotaInterna' ? current?.autor_id : null)
      || parent?.tecnico_id
      || null;
    const ownsExistingAuthorship = !current || !canonicalAuthorId || canonicalAuthorId === user.id;
    const technicalAllowed = effectiveTechnician
      && ownsExistingAuthorship
      && authorization.capabilities.includes('TECHNICAL_WORK');
    const commercialAllowed = policy.authority === 'TECHNICAL_OR_COMMERCIAL'
      && authorization.capabilities.includes('QUOTE_OPERATIONS');
    const authoritativeAllowed = technicalAllowed || commercialAllowed;
    const commandCapability = technicalAllowed
      ? { allOf: ['TECHNICAL_WORK'] }
      : { allOf: ['QUOTE_OPERATIONS'] };
    const commandRelationship = technicalAllowed ? 'EFFECTIVE_TECHNICIAN' : 'BRANCH_RESOURCE';
    const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
      ? body.correlation_id.trim().slice(0, 240)
      : `technical-record:${entityName}:${body.id || crypto.randomUUID()}:${operation}`;
    const auditOperationId = crypto.randomUUID();
    const decision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId: 'CP-DIAG-002',
      authorization,
      relationship: authoritativeAllowed ? commandRelationship : 'NONE',
      commandCapability,
      commandRelationship,
      scopeSatisfied: branch.ok,
      preconditionSatisfied: authoritativeAllowed,
      preconditionCode: ownsExistingAuthorship
        ? 'EFFECTIVE_TECHNICIAN_REQUIRED'
        : 'TECHNICAL_RECORD_AUTHORSHIP_REQUIRED',
      compatibilityDecision: {
        ok: authoritativeAllowed,
        code: authoritativeAllowed ? 'ALLOW' : 'LEGACY_TECHNICAL_RECORD_DENY',
      },
      audit: {
        actorUserId: user.id,
        branchId: workOrder.branch_id,
        resourceType: entityName,
        resourceId: current?.id || `pending:${workOrder.id}`,
        correlationId,
      },
    });

    return await ExecuteSovereignCommand({
      decision,
      sovereignWriter: 'technicalRecordCommand',
      execute: async () => {
        const mutable = pickProjection(body.data || {}, policy.fields);
        const serverFields = buildServerFields(entityName, workOrder, user, parent);
        const payload = { ...mutable, ...serverFields };
        let record;
        if (operation === 'create') record = await entity.create(payload);
        else record = await entity.update(current.id, payload);
        try {
          await appendAuditEvent(base44, {
            eventType: 'TECHNICAL_RECORD_MUTATED',
            principalClass: authorization.principalClass,
            actorUserId: user.id,
            actorPrimaryRole: authorization.persistedRole,
            effectiveTechnicianUserId: technicalAllowed ? user.id : null,
            organizationId: authorization.organizationId,
            branchId: workOrder.branch_id,
            resourceType: entityName,
            resourceId: record.id,
            commandPolicyId: 'CP-DIAG-002',
            correlationId,
            externalCorrelationId: correlationId,
            auditOperationId,
            operationKey: auditOperationId,
            operationSemantics: { operation },
            priorState: operation === 'update' ? pickProjection(current, policy.fields) : {},
            newState: {
              operation,
              work_order_id: workOrder.id,
              ...pickProjection(record, policy.fields),
            },
            custodySnapshot: { tecnico_asignado_id: workOrder.tecnico_asignado_id || null },
          });
        } catch (error) {
          if (operation === 'create') await entity.delete(record.id).catch(() => null);
          else {
            const rollback = { ...pickProjection(current, policy.fields), ...buildServerFields(entityName, workOrder, user, parent) };
            await entity.update(current.id, rollback).catch(() => null);
          }
          throw error;
        }
        return Response.json({
          record: pickProjection(record, ['id', ...policy.fields, ...Object.keys(serverFields), 'created_date', 'updated_date']),
        });
      },
    });
  } catch (error) {
    if (error instanceof SovereignCommandError) return fail(error.message, error.status, error.code);
    console.error('[technicalRecordCommand]', error?.message || error);
    return fail('No fue posible mutar el registro tecnico', 500, 'TECHNICAL_RECORD_FAILED');
  }
});
