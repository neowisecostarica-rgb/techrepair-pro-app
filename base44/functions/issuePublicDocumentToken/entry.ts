import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { issuePublicTokenMetadata } from '../_shared/publicTokenContract.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';
import { resolvePublicResourceRelations } from '../_shared/publicResourceRelations.ts';

const TYPES = Object.freeze({
  work_order: { entity: 'OrdenTrabajo', purpose: 'WORK_ORDER_STATUS_READ', capability: 'CUSTOMER_SERVICE_OPERATIONS' },
  quote: { entity: 'Cotizacion', purpose: 'QUOTE_DECISION', capability: 'QUOTE_OPERATIONS' },
  warranty: { entity: 'Garantia', purpose: 'WARRANTY_READ', capability: 'DELIVERY_OPERATIONS' },
  receipt: { entity: 'Venta', purpose: 'RECEIPT_READ', capability: 'SALE_OPERATIONS' },
});

function fail(error, status, code) { return Response.json({ error, code }, { status }); }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return fail('No autenticado', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => ({}));
  const contract = TYPES[body.type];
  const action = body.action === 'revoke' ? 'revoke' : 'issue';
  const resourceId = typeof body.resource_id === 'string' ? body.resource_id.trim() : '';
  if (!contract || !resourceId) return fail('Solicitud de enlace invalida', 400, 'PUBLIC_TOKEN_REQUEST_INVALID');
  const authorization = await resolveAuthorizedContext(base44, user);
  if (!authorization.ok) return fail(authorization.error, authorization.status, authorization.code);
  if (authorization.pilotMode && body.type === 'quote' && action === 'issue') {
    return fail('La decision publica de cotizaciones esta deshabilitada durante el piloto controlado', 409, 'CONTROLLED_PILOT_PUBLIC_DECISION_DISABLED');
  }
  if (!authorization.capabilities.includes(contract.capability)) return fail('No autorizado para emitir este enlace', 403, 'CAPABILITY_DENIED');
  const records = await base44.asServiceRole.entities[contract.entity].filter({ id: resourceId, organization_id: authorization.organizationId }, '-created_date', 2);
  if (records?.length !== 1) return fail('Recurso no encontrado', 404, 'PUBLIC_RESOURCE_NOT_FOUND');
  const record = records[0];
  if (action === 'issue') {
    const relations = await resolvePublicResourceRelations(base44, { type: body.type, record });
    if (!relations.ok) return fail('Las relaciones del recurso publico no son validas', 409, relations.code);
  }
  let branchId = record.branch_id || null;
  if (!branchId && record.orden_trabajo_id) {
    const orders = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: record.orden_trabajo_id, organization_id: authorization.organizationId }, '-created_date', 1);
    branchId = orders?.[0]?.branch_id || null;
  }
  const scope = authorizeRecordBranch(authorization, branchId);
  if (!scope.ok) return fail(scope.error, scope.status, scope.code);
  if (action === 'issue' && body.type === 'receipt' && record.estado !== 'pagada') return fail('Solo una venta pagada puede publicarse', 409, 'RECEIPT_NOT_COMMITTED');
  const version = body.type === 'quote' ? record.version || 'v1' : 'v1';
  const metadata = action === 'revoke'
    ? { public_access_revoked_at: new Date().toISOString() }
    : issuePublicTokenMetadata({ purpose: contract.purpose, resourceId: record.id, version });
  const updated = await base44.asServiceRole.entities[contract.entity].update(record.id, metadata);
  const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
    ? body.correlation_id.trim().slice(0, 240)
    : crypto.randomUUID();
  const auditOperationId = crypto.randomUUID();
  try {
    await appendAuditEvent(base44, {
      eventType: action === 'revoke' ? 'PUBLIC_TOKEN_REVOKED' : 'PUBLIC_TOKEN_ISSUED', principalClass: authorization.principalClass,
      actorUserId: user.id, actorPrimaryRole: authorization.persistedRole,
      organizationId: authorization.organizationId, branchId,
      resourceType: contract.entity, resourceId: record.id,
      commandPolicyId: 'CP-PUBLIC-001', correlationId, auditOperationId,
      operationSemantics: { action },
      metadata: { purpose: contract.purpose, version, expires_at: metadata.public_access_expires_at || null },
    });
  } catch (error) {
    await base44.asServiceRole.entities[contract.entity].update(record.id, {
      public_access_token: record.public_access_token || null,
      public_access_purpose: record.public_access_purpose || null,
      public_access_resource_id: record.public_access_resource_id || null,
      public_access_version: record.public_access_version || null,
      public_access_issued_at: record.public_access_issued_at || null,
      public_access_expires_at: record.public_access_expires_at || null,
      public_access_revoked_at: record.public_access_revoked_at || null,
      public_access_consumed_at: record.public_access_consumed_at || null,
    }).catch(() => null);
    throw error;
  }
  if (action === 'revoke') return Response.json({
    revoked: true,
    purpose: contract.purpose,
    resource_id: updated.id,
    version,
  });
  return Response.json({
    purpose: contract.purpose,
    resource_id: updated.id,
    version,
    expires_at: metadata.public_access_expires_at,
    token: metadata.public_access_token,
  });
});
