import { isKnownCapability } from './roleCapabilities.ts';

export const COMMAND_POLICY_VERSION = 'TRP_MULTIUSER_COMMAND_POLICY_V1';

export const PRINCIPAL_CLASSES = Object.freeze([
  'HUMAN_MEMBER',
  'CUSTOMER_TOKEN',
  'SYSTEM_AUTOMATION',
  'PLATFORM_ADMIN',
]);

export const RESOURCE_RELATIONSHIPS = Object.freeze([
  'NONE',
  'ORG_RESOURCE',
  'BRANCH_RESOURCE',
  'ASSIGNEE',
  'EFFECTIVE_TECHNICIAN',
  'SUPERVISOR',
  'REQUESTER',
  'APPROVER',
  'INVENTORY_FULFILLER',
  'CUSTOMER_TOKEN_RESOURCE',
]);

const policy = (definition) => Object.freeze({
  version: COMMAND_POLICY_VERSION,
  auditRequired: true,
  returnsProjection: null,
  migrationCategory: 'ROUTE_TO_CANONICAL_COMMAND',
  ...definition,
});

export const COMMAND_POLICIES = Object.freeze({
  'CP-OT-001': policy({ endpoint: 'createWorkOrder', principalClasses: ['HUMAN_MEMBER'], capability: { anyOf: ['RECEPTION_OPERATIONS', 'SALE_OPERATIONS'] }, scope: 'BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'RECEPTION_ELIGIBLE', writer: 'createWorkOrder', auditOwner: 'AuditEvent+OTEvent', returnsProjection: 'RECEPTION_CUSTOMER_CONTEXT' }),
  'CP-OT-002': policy({ endpoint: 'transitionWorkOrderStatus', principalClasses: ['HUMAN_MEMBER'], capability: { commandSpecific: true }, scope: 'OT_BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'EXACT_LIFECYCLE_EDGE_AND_GATES', writer: 'transitionWorkOrderStatus', auditOwner: 'AuditEvent+OTEvent' }),
  'CP-ASG-001': policy({ endpoint: 'reassignWorkOrderTechnician:initial', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_ASSIGNMENT'] }, scope: 'OT_BRANCH', relationship: 'SUPERVISOR', precondition: 'ELIGIBLE_TECHNICIAN_AND_NO_TECHNICAL_EXECUTION', writer: 'reassignWorkOrderTechnician', auditOwner: 'AuditEvent+OTEvent' }),
  'CP-ASG-002': policy({ endpoint: 'reassignWorkOrderTechnician:forced', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_ASSIGNMENT'] }, scope: 'OT_BRANCH', relationship: 'SUPERVISOR', precondition: 'ADMIN_ONLY_AFTER_EXECUTION_AND_PRESERVE_HISTORY', writer: 'reassignWorkOrderTechnician', auditOwner: 'AuditEvent+OTEvent' }),
  'CP-TECH-001': policy({ endpoint: 'initTechnicalActivity:start', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_WORK'] }, scope: 'OT_BRANCH', relationship: 'EFFECTIVE_TECHNICIAN', precondition: 'ONE_ACTIVE_WORK_AND_CURRENT_ASSIGNMENT', writer: 'initTechnicalActivity', auditOwner: 'AuditEvent+ActividadTecnica' }),
  'CP-TECH-002': policy({ endpoint: 'technicalActivity:pause', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_WORK'] }, scope: 'OT_BRANCH', relationship: 'EFFECTIVE_TECHNICIAN', precondition: 'CLOSE_CURRENT_SEGMENT', writer: 'technicalActivityCommand', auditOwner: 'AuditEvent+ActividadTecnica' }),
  'CP-TECH-003': policy({ endpoint: 'technicalActivity:resume', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_WORK'] }, scope: 'OT_BRANCH', relationship: 'EFFECTIVE_TECHNICIAN', precondition: 'CREATE_NEW_SEGMENT_AND_ONE_ACTIVE_WORK', writer: 'technicalActivityCommand', auditOwner: 'AuditEvent+ActividadTecnica' }),
  'CP-DIAG-001': policy({ endpoint: 'updateDiagnosticoResumen', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_WORK'] }, scope: 'OT_BRANCH', relationship: 'EFFECTIVE_TECHNICIAN', precondition: 'CURRENT_CUSTODY_AND_ATTRIBUTION', writer: 'updateDiagnosticoResumen', auditOwner: 'AuditEvent+technical-evidence' }),
  'CP-DIAG-002': policy({ endpoint: 'technicalRecordCommand', principalClasses: ['HUMAN_MEMBER'], capability: { commandSpecific: true }, scope: 'OT_BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'TENANT_PARENT_BRANCH_AND_AUTHORSHIP', writer: 'technicalRecordCommand', auditOwner: 'AuditEvent+technical-record' }),
  'CP-QA-001': policy({ endpoint: 'recordTechnicalTest', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_WORK'] }, scope: 'OT_BRANCH', relationship: 'EFFECTIVE_TECHNICIAN', precondition: 'CURRENT_QA_CYCLE_AND_AUTHORSHIP', writer: 'recordTechnicalTest', auditOwner: 'AuditEvent+PruebaTecnica' }),
  'CP-QUOTE-001': policy({ endpoint: 'operationalGateway:Cotizacion', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['QUOTE_OPERATIONS'] }, scope: 'BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'SERVER_COMMERCIAL_RULES', writer: 'operationalGateway', auditOwner: 'AuditEvent' }),
  'CP-QUOTE-002': policy({ endpoint: 'handlePublicCustomerDecisionV2', principalClasses: ['CUSTOMER_TOKEN'], authorityContract: 'QUOTE_DECISION', capability: null, scope: 'EXACT_TOKEN_RESOURCE', relationship: 'CUSTOMER_TOKEN_RESOURCE', precondition: 'TOKEN_PURPOSE_VERSION_EXPIRY_REVOCATION_AND_WORKFLOW', writer: 'handlePublicCustomerDecisionV2', auditOwner: 'AuditEvent+OTEvent' }),
  'CP-SALE-001': policy({ endpoint: 'createSale', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['SALE_OPERATIONS'] }, scope: 'BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'SERVER_TOTALS_AND_IDEMPOTENCY', writer: 'createSale', auditOwner: 'AuditEvent+Venta' }),
  'CP-DEL-001': policy({ endpoint: 'deliverWorkOrder', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['DELIVERY_OPERATIONS'] }, scope: 'OT_BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'PAYMENT_QA_ACTIVITY_AND_ACCEPTANCE_GATES', writer: 'deliverWorkOrder', auditOwner: 'AuditEvent+EntregaLog' }),
  'CP-INV-001': policy({ endpoint: 'inventoryMutationService', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['INVENTORY_OPERATIONS'] }, scope: 'BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'CANONICAL_LEDGER_AND_IDEMPOTENCY', writer: 'inventoryMutationService', auditOwner: 'AuditEvent+InventarioHistorial' }),
  'CP-REQ-001': policy({ endpoint: 'technicalRequestCommand:request', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_WORK'] }, scope: 'OT_BRANCH', relationship: 'EFFECTIVE_TECHNICIAN', precondition: 'REQUESTER_ATTRIBUTION', writer: 'technicalRequestCommand', auditOwner: 'AuditEvent+SolicitudTecnica' }),
  'CP-REQ-002': policy({ endpoint: 'technicalRequestCommand:approve-spend', principalClasses: ['HUMAN_MEMBER'], capability: { anyOf: ['BRANCH_ADMINISTRATION', 'ORG_ADMINISTRATION'] }, scope: 'BRANCH_OR_ORGANIZATION', relationship: 'APPROVER', precondition: 'NEW_SPEND_REQUIRES_ADMIN', writer: 'technicalRequestCommand', auditOwner: 'AuditEvent+SolicitudTecnica' }),
  'CP-REQ-003': policy({ endpoint: 'technicalRequestCommand:fulfill-stock', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['INVENTORY_OPERATIONS'] }, scope: 'BRANCH', relationship: 'INVENTORY_FULFILLER', precondition: 'INVENTORY_COMMIT_BEFORE_FULFILLED', writer: 'technicalRequestCommand->inventoryMutationService', auditOwner: 'AuditEvent+SolicitudTecnica+InventarioHistorial' }),
  'CP-CUST-001': policy({ endpoint: 'createClient/updateClient/crmGateway', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['CUSTOMER_SERVICE_OPERATIONS'] }, scope: 'BRANCH_RESOURCE', relationship: 'BRANCH_RESOURCE', precondition: 'SAFE_CUSTOMER_FIELDS', writer: 'customer gateways', auditOwner: 'AuditEvent', returnsProjection: 'RECEPTION_CUSTOMER_CONTEXT' }),
  'CP-EQP-001': policy({ endpoint: 'createEquipment/operationalGateway:Equipo', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['RECEPTION_OPERATIONS'] }, scope: 'BRANCH_RESOURCE', relationship: 'BRANCH_RESOURCE', precondition: 'AUTHORIZED_CUSTOMER_RELATIONSHIP', writer: 'equipment gateways', auditOwner: 'AuditEvent', returnsProjection: 'RECEPTION_CUSTOMER_CONTEXT' }),
  'CP-CRM-001': policy({ endpoint: 'crmGateway', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['CRM_OPERATIONS'] }, scope: 'BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'BRANCH_CUSTOMER_RELATIONSHIP', writer: 'crmGateway', auditOwner: 'AuditEvent' }),
  'CP-AGENDA-001': policy({ endpoint: 'operationalGateway:Cita', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['AGENDA_OPERATIONS'] }, scope: 'BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'BRANCH_APPOINTMENT', writer: 'operationalGateway', auditOwner: 'AuditEvent', returnsProjection: 'CUSTOMER_SERVICE_CONTEXT' }),
  'CP-CUSTODY-001': policy({ endpoint: 'updateCustodiaData', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['TECHNICAL_WORK'] }, scope: 'OT_BRANCH', relationship: 'EFFECTIVE_TECHNICIAN', precondition: 'CURRENT_CUSTODY_AND_ATTRIBUTION', writer: 'updateCustodiaData', auditOwner: 'AuditEvent' }),
  'CP-RECYCLE-001': policy({ endpoint: 'operationalGateway:Reciclaje', principalClasses: ['HUMAN_MEMBER'], capability: { anyOf: ['TECHNICAL_WORK', 'BRANCH_ADMINISTRATION'] }, scope: 'BRANCH', relationship: 'BRANCH_RESOURCE', precondition: 'AUTHORIZED_BRANCH', writer: 'operationalGateway', auditOwner: 'AuditEvent' }),
  'CP-FIN-001': policy({ endpoint: 'operationalGateway:Expense/PurchaseInvoice/SupplierPayment', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['FINANCIAL_READ'] }, scope: 'BRANCH_OR_ORGANIZATION', relationship: 'BRANCH_RESOURCE', precondition: 'ADMIN_FINANCIAL_SCOPE', writer: 'operationalGateway', auditOwner: 'AuditEvent' }),
  'CP-NOTIF-001': policy({ endpoint: 'notificationCommand', principalClasses: ['SYSTEM_AUTOMATION', 'HUMAN_MEMBER'], capability: { commandSpecific: true }, scope: 'RESOURCE_SCOPE', relationship: 'ORG_RESOURCE', precondition: 'DURABLE_TRIGGER_AND_DEDUPLICATION', writer: 'notificationCommand', auditOwner: 'AuditEvent' }),
  'CP-USER-001': policy({ endpoint: 'manageOrgUser', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['USER_ADMINISTRATION'] }, scope: 'ORGANIZATION', relationship: 'ORG_RESOURCE', precondition: 'ORG_ADMIN_ONLY_AND_LAST_ADMIN_PROTECTION', writer: 'manageOrgUser', auditOwner: 'AuditEvent' }),
  'CP-PROV-001': policy({ endpoint: 'identityGateway:bootstrapOrganization|adminCreateOrganization', principalClasses: ['PLATFORM_ADMIN', 'HUMAN_MEMBER'], capability: null, authorityContract: 'PLATFORM_OR_SELF_PROVISIONING', scope: 'NEW_ORGANIZATION', relationship: 'ORG_RESOURCE', precondition: 'CANONICAL_MANIFEST_AND_READINESS_VALIDATION', writer: 'identityGateway->tenantProvisioning', auditOwner: 'AuditEvent' }),
  'CP-BR-001': policy({ endpoint: 'manageBranchLifecycle', principalClasses: ['HUMAN_MEMBER'], capability: { allOf: ['ORG_ADMINISTRATION'] }, scope: 'ORGANIZATION', relationship: 'ORG_RESOURCE', precondition: 'BRANCH_LIFECYCLE_PROTECTION', writer: 'manageBranchLifecycle', auditOwner: 'AuditEvent+BranchLifecycleOperation' }),
  'CP-PUBLIC-001': policy({ endpoint: 'getPublicCommercialDocument', principalClasses: ['CUSTOMER_TOKEN'], capability: null, authorityContract: 'PUBLIC_DOCUMENT_READ', scope: 'EXACT_TOKEN_RESOURCE', relationship: 'CUSTOMER_TOKEN_RESOURCE', precondition: 'PURPOSE_RESOURCE_EXPIRY_REVOCATION', writer: 'NONE_READ_ONLY', auditOwner: 'AuditEvent', migrationCategory: 'READ_ONLY_PROJECTION' }),
  'CP-AUTO-001': policy({ endpoint: 'processOTEvent/processPostSaleActions', principalClasses: ['SYSTEM_AUTOMATION'], capability: null, authorityContract: 'TRUSTED_AUTOMATION_ATTESTATION', scope: 'EVENT_RESOURCE', relationship: 'ORG_RESOURCE', precondition: 'POSITIVE_RUNTIME_ATTESTATION_REQUIRED', writer: 'event consumer', auditOwner: 'AuditEvent' }),
});

export const OT_TRANSITION_POLICIES = Object.freeze({
  'EN_COLA_REVISION->ASIGNADA': { capability: { allOf: ['TECHNICAL_ASSIGNMENT'] }, relationship: 'SUPERVISOR' },
  'ASIGNADA->EN_REVISION': { capability: { allOf: ['TECHNICAL_WORK'] }, relationship: 'EFFECTIVE_TECHNICIAN' },
  'EN_REVISION->DIAGNOSTICADA': { capability: { allOf: ['TECHNICAL_WORK'] }, relationship: 'EFFECTIVE_TECHNICIAN' },
  'DIAGNOSTICADA->COTIZADA': { capability: { allOf: ['QUOTE_OPERATIONS'] }, relationship: 'BRANCH_RESOURCE' },
  'DIAGNOSTICADA->APROBADA': { capability: { allOf: ['QUOTE_OPERATIONS'] }, relationship: 'BRANCH_RESOURCE', alternativePublicAuthority: 'QUOTE_DECISION' },
  'COTIZADA->APROBADA': { capability: { allOf: ['QUOTE_OPERATIONS'] }, relationship: 'BRANCH_RESOURCE', alternativePublicAuthority: 'QUOTE_DECISION' },
  'APROBADA->EN_REPARACION': { capability: { allOf: ['TECHNICAL_WORK'] }, relationship: 'EFFECTIVE_TECHNICIAN' },
  'EN_REPARACION->PRUEBAS': { capability: { allOf: ['TECHNICAL_WORK'] }, relationship: 'EFFECTIVE_TECHNICIAN' },
  'PRUEBAS->FINALIZADA': { capability: { allOf: ['TECHNICAL_WORK'] }, relationship: 'EFFECTIVE_TECHNICIAN' },
  'PRUEBAS->EN_REPARACION': { capability: { allOf: ['TECHNICAL_WORK'] }, relationship: 'EFFECTIVE_TECHNICIAN' },
  'FINALIZADA->ENTREGADA': { capability: { allOf: ['DELIVERY_OPERATIONS'] }, relationship: 'BRANCH_RESOURCE' },
});

function evaluateCapability(expression, capabilities) {
  if (!expression || expression.commandSpecific) return false;
  if (expression.allOf) return expression.allOf.every(item => capabilities.includes(item));
  if (expression.anyOf) return expression.anyOf.some(item => capabilities.includes(item));
  return false;
}

function validateCapabilityExpression(expression) {
  if (!expression || expression.commandSpecific) return false;
  const capabilities = [...(expression.allOf || []), ...(expression.anyOf || [])];
  return capabilities.length > 0 && capabilities.every(isKnownCapability);
}

export function validateCommandPolicyRegistry() {
  const errors = [];
  for (const [id, row] of Object.entries(COMMAND_POLICIES)) {
    if (!row.endpoint || !row.scope || !row.relationship || !row.precondition || !row.writer || !row.auditOwner || !row.migrationCategory) errors.push(`${id}:INCOMPLETE`);
    if (!RESOURCE_RELATIONSHIPS.includes(row.relationship)) errors.push(`${id}:UNKNOWN_RELATIONSHIP`);
    if (!row.principalClasses?.every(item => PRINCIPAL_CLASSES.includes(item))) errors.push(`${id}:UNKNOWN_PRINCIPAL`);
    for (const capability of [...(row.capability?.allOf || []), ...(row.capability?.anyOf || [])]) {
      if (!isKnownCapability(capability)) errors.push(`${id}:UNKNOWN_CAPABILITY:${capability}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function evaluateCommandPolicy({
  policyId,
  authorization,
  relationship,
  authorityContract = null,
  commandCapability = null,
  commandRelationship = null,
  scopeSatisfied = true,
  preconditionSatisfied = true,
  preconditionStatus = 403,
  preconditionCode = 'COMMAND_PRECONDITION_DENIED',
}) {
  const row = COMMAND_POLICIES[policyId];
  if (!row) return { ok: false, status: 403, code: 'COMMAND_POLICY_UNKNOWN' };
  if (!authorization?.ok) return { ok: false, status: authorization?.status || 403, code: 'AUTHORIZATION_CONTEXT_INVALID' };
  if (!row.principalClasses.includes(authorization.principalClass)) return { ok: false, status: 403, code: 'PRINCIPAL_CLASS_DENIED' };
  if (scopeSatisfied !== true) return { ok: false, status: 403, code: 'COMMAND_SCOPE_DENIED' };
  if (preconditionSatisfied !== true) return { ok: false, status: preconditionStatus, code: preconditionCode };

  const commandSpecific = row.capability?.commandSpecific === true;
  if (!commandSpecific && (commandCapability || commandRelationship)) {
    return { ok: false, status: 403, code: 'COMMAND_POLICY_OVERRIDE_DENIED' };
  }
  if (commandSpecific && !validateCapabilityExpression(commandCapability)) {
    return { ok: false, status: 403, code: 'COMMAND_CAPABILITY_UNRESOLVED' };
  }
  const requiredRelationship = commandSpecific
    ? commandRelationship
    : row.relationship;
  if (!RESOURCE_RELATIONSHIPS.includes(requiredRelationship)) {
    return { ok: false, status: 403, code: 'COMMAND_RELATIONSHIP_UNRESOLVED' };
  }
  if (requiredRelationship !== relationship) return { ok: false, status: 403, code: 'RESOURCE_RELATIONSHIP_DENIED' };
  if (row.authorityContract) {
    if (row.authorityContract !== authorityContract) return { ok: false, status: 403, code: 'AUTHORITY_CONTRACT_DENIED' };
  } else if (!evaluateCapability(commandSpecific ? commandCapability : row.capability, authorization.capabilities || [])) {
    return { ok: false, status: 403, code: 'CAPABILITY_DENIED' };
  }
  return {
    ok: true,
    policy: row,
    effectiveCapability: commandSpecific ? commandCapability : row.capability,
    effectiveRelationship: requiredRelationship,
  };
}

/** Frozen architecture name. */
export const EvaluateCommandPolicy = evaluateCommandPolicy;
