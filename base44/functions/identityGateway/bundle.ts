// base44/functions/identityGateway/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

// base44/functions/identityGateway/_shared/controlledPilotAuthority.ts
function cleanId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function inspectControlledPilotConfiguration(organization) {
  if (organization?.controlled_pilot_mode !== true) {
    return { enabled: false, valid: true, operatorUserId: null, branchId: null };
  }
  const operatorUserId = cleanId(organization.controlled_pilot_operator_user_id);
  const branchId = cleanId(organization.controlled_pilot_branch_id);
  return {
    enabled: true,
    valid: Boolean(operatorUserId && branchId),
    operatorUserId,
    branchId
  };
}
function evaluateControlledPilotHumanAccess({ organization, user, account, isSuperAdmin = false }) {
  const configuration = inspectControlledPilotConfiguration(organization);
  if (!configuration.enabled) return { ok: true, pilotMode: false };
  if (!configuration.valid) {
    return {
      ok: false,
      status: 503,
      code: "CONTROLLED_PILOT_CONFIGURATION_INVALID",
      error: "La configuracion del piloto controlado es invalida; toda mutacion permanece bloqueada"
    };
  }
  if (isSuperAdmin) {
    return {
      ok: false,
      status: 403,
      code: "CONTROLLED_PILOT_OPERATOR_REQUIRED",
      error: "El superadmin no puede mutar una organizacion en piloto controlado"
    };
  }
  const exactOperator = user?.id === configuration.operatorUserId && account?.user_id === configuration.operatorUserId && account?.organization_id === organization?.id && account?.status === "active" && account?.role === "ORG_ADMIN";
  if (!exactOperator) {
    return {
      ok: false,
      status: 403,
      code: "CONTROLLED_PILOT_OPERATOR_REQUIRED",
      error: "Solo el operador designado puede actuar durante el piloto controlado"
    };
  }
  return {
    ok: true,
    pilotMode: true,
    operatorUserId: configuration.operatorUserId,
    branchId: configuration.branchId
  };
}

// base44/functions/identityGateway/_shared/roleCapabilities.ts
var AUTHORIZATION_PRESET_VERSION = "TRP_MULTIUSER_V1";
var TENANT_ROLES = Object.freeze([
  "ORG_ADMIN",
  "BRANCH_ADMIN",
  "TECHNICIAN",
  "SALES",
  "INVENTORY",
  "CUSTOMER_SERVICE"
]);
var CAPABILITIES = Object.freeze([
  "ORG_ADMINISTRATION",
  "BRANCH_ADMINISTRATION",
  "USER_ADMINISTRATION",
  "RECEPTION_OPERATIONS",
  "CUSTOMER_READ_OPERATIONAL",
  "CUSTOMER_SERVICE_OPERATIONS",
  "TECHNICAL_WORK",
  "TECHNICAL_SUPERVISION",
  "TECHNICAL_ASSIGNMENT",
  "QUOTE_OPERATIONS",
  "SALE_OPERATIONS",
  "COMMERCIAL_READ",
  "FINANCIAL_READ",
  "INVENTORY_READ",
  "INVENTORY_OPERATIONS",
  "INVENTORY_ADMINISTRATION",
  "DELIVERY_OPERATIONS",
  "CRM_OPERATIONS",
  "AGENDA_OPERATIONS"
]);
var ROLE_CAPABILITY_PRESETS = Object.freeze({
  ORG_ADMIN: CAPABILITIES,
  BRANCH_ADMIN: ["BRANCH_ADMINISTRATION", "RECEPTION_OPERATIONS", "CUSTOMER_READ_OPERATIONAL", "CUSTOMER_SERVICE_OPERATIONS", "TECHNICAL_WORK", "TECHNICAL_SUPERVISION", "TECHNICAL_ASSIGNMENT", "QUOTE_OPERATIONS", "SALE_OPERATIONS", "COMMERCIAL_READ", "FINANCIAL_READ", "INVENTORY_READ", "INVENTORY_OPERATIONS", "INVENTORY_ADMINISTRATION", "DELIVERY_OPERATIONS", "CRM_OPERATIONS", "AGENDA_OPERATIONS"],
  TECHNICIAN: ["CUSTOMER_READ_OPERATIONAL", "TECHNICAL_WORK", "COMMERCIAL_READ", "INVENTORY_READ", "INVENTORY_OPERATIONS"],
  SALES: ["RECEPTION_OPERATIONS", "CUSTOMER_READ_OPERATIONAL", "CUSTOMER_SERVICE_OPERATIONS", "TECHNICAL_ASSIGNMENT", "QUOTE_OPERATIONS", "SALE_OPERATIONS", "COMMERCIAL_READ", "INVENTORY_READ", "DELIVERY_OPERATIONS", "CRM_OPERATIONS", "AGENDA_OPERATIONS"],
  INVENTORY: ["CUSTOMER_READ_OPERATIONAL", "COMMERCIAL_READ", "INVENTORY_READ", "INVENTORY_OPERATIONS", "INVENTORY_ADMINISTRATION"],
  CUSTOMER_SERVICE: ["RECEPTION_OPERATIONS", "CUSTOMER_READ_OPERATIONAL", "CUSTOMER_SERVICE_OPERATIONS", "COMMERCIAL_READ", "DELIVERY_OPERATIONS", "AGENDA_OPERATIONS"]
});
function normalizeTenantRole(role) {
  if (role === "SUPPORT") return "CUSTOMER_SERVICE";
  return TENANT_ROLES.includes(role) ? role : null;
}
function getRoleCapabilities(role) {
  const normalizedRole = normalizeTenantRole(role);
  return normalizedRole ? [...ROLE_CAPABILITY_PRESETS[normalizedRole] || []] : [];
}
function getRoleScope(role) {
  const normalizedRole = normalizeTenantRole(role);
  if (!normalizedRole) return null;
  return normalizedRole === "ORG_ADMIN" ? "ORGANIZATION" : "SINGLE_BRANCH";
}

// base44/functions/identityGateway/_shared/userAuthorization.ts
function isCanonicalActiveUserAccount(account) {
  return account?.status === "active";
}
function getUserDataField(user, field) {
  return user?.data?.[field] ?? user?.[field] ?? null;
}
function isCanonicalSuperAdmin(user) {
  return user?.role === "admin" && getUserDataField(user, "is_super_admin") === true;
}
function sanitizeUserAccount(account) {
  if (!account) return null;
  const role = normalizeTenantRole(account.role);
  return {
    id: account.id,
    user_id: account.user_id || null,
    user_email: account.user_email,
    organization_id: account.organization_id,
    branch_id: account.branch_id || null,
    role,
    persisted_role: account.role,
    capabilities: getRoleCapabilities(role),
    authorization_scope: getRoleScope(role),
    authorization_preset_version: AUTHORIZATION_PRESET_VERSION,
    status: account.status,
    active: account.status === "active",
    invited_at: account.invited_at || null,
    accepted_at: account.accepted_at || null
  };
}
async function loadActiveOrganization(base44, organizationId) {
  if (!organizationId) return null;
  const organizations = await base44.asServiceRole.entities.Organization.filter({
    id: organizationId,
    status: "active"
  }, "-created_date", 2);
  return organizations?.length === 1 ? organizations[0] : null;
}
async function loadActiveBranch(base44, organizationId, branchId) {
  if (!organizationId || !branchId) return null;
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: organizationId,
    active: true
  }, "-created_date", 2);
  return branches?.length === 1 ? branches[0] : null;
}
function sanitizeOrganization(organization) {
  if (!organization) return null;
  const {
    id,
    name,
    legal_name,
    country,
    currency,
    plan,
    status,
    partner_id,
    telefono_negocio,
    logo_url,
    email,
    direccion_comercial,
    tipo_entidad,
    identificacion_fiscal,
    direccion_fiscal,
    public_base_url,
    garantia_config,
    saldo_caja_inicial,
    saldo_caja_actual,
    ultima_actualizacion_caja,
    inventario_config,
    marketing_spend,
    authorization_preset_version,
    custom_grants_enabled,
    provisioning_status,
    provisioned_at
  } = organization;
  return {
    id,
    name,
    legal_name,
    country,
    currency,
    plan,
    status,
    partner_id,
    telefono_negocio,
    logo_url,
    email,
    direccion_comercial,
    tipo_entidad,
    identificacion_fiscal,
    direccion_fiscal,
    public_base_url,
    garantia_config,
    saldo_caja_inicial,
    saldo_caja_actual,
    ultima_actualizacion_caja,
    inventario_config,
    marketing_spend,
    authorization_preset_version,
    custom_grants_enabled,
    provisioning_status,
    provisioned_at
  };
}
async function loadCanonicalMemberships(base44, user) {
  const [byUserId, byEmail] = await Promise.all([
    base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, "-created_date", 100),
    user.email ? base44.asServiceRole.entities.UserAccount.filter({ user_email: user.email }, "-created_date", 100) : Promise.resolve([])
  ]);
  const unique2 = /* @__PURE__ */ new Map();
  for (const account of [...byUserId || [], ...byEmail || []]) {
    if (account?.id) unique2.set(account.id, account);
  }
  return [...unique2.values()];
}
async function resolveIdentitySnapshot(base44, user) {
  if (!user?.id) return { ok: false, status: 401, error: "No autenticado" };
  const memberships = await loadCanonicalMemberships(base44, user);
  const activeMemberships = memberships.filter(
    (account) => account.user_id === user.id && account.organization_id && isCanonicalActiveUserAccount(account)
  );
  const isSuperAdmin = isCanonicalSuperAdmin(user) && activeMemberships.length === 0;
  const pendingInvitations = memberships.filter(
    (account) => account.user_email === user.email && account.organization_id && account.status === "invited" && (!account.user_id || account.user_id === user.id)
  );
  const persistedOrganizationId = getUserDataField(user, "organization_id");
  const impersonatingOrganizationId = isSuperAdmin ? getUserDataField(user, "impersonating_org_id") : null;
  const activeAccount = isSuperAdmin ? null : activeMemberships.find((account) => account.organization_id === persistedOrganizationId) || (activeMemberships.length === 1 ? activeMemberships[0] : null);
  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name || null,
      platform_role: user.role,
      is_super_admin: isSuperAdmin,
      organization_id: isSuperAdmin ? impersonatingOrganizationId : activeAccount?.organization_id || null,
      impersonating_org_id: impersonatingOrganizationId,
      impersonating_started_at: isSuperAdmin ? getUserDataField(user, "impersonating_started_at") : null
    },
    memberships,
    activeMemberships,
    pendingInvitations,
    activeAccount,
    isSuperAdmin
  };
}
async function resolveAuthorizedContext(base44, user, options = {}) {
  const {
    organizationHint = null,
    allowedRoles = [],
    requireOrganization = true
  } = options;
  const identity = await resolveIdentitySnapshot(base44, user);
  if (!identity.ok) return identity;
  if (identity.isSuperAdmin) {
    const impersonatedOrgId = identity.user.impersonating_org_id;
    if (organizationHint && organizationHint !== impersonatedOrgId) {
      return { ok: false, status: 403, error: "La organizacion solicitada no coincide con la impersonacion autorizada" };
    }
    if (requireOrganization && !impersonatedOrgId) {
      return { ok: false, status: 403, error: "Inicia una impersonacion autorizada antes de continuar" };
    }
    const organization2 = impersonatedOrgId ? await loadActiveOrganization(base44, impersonatedOrgId) : null;
    if (impersonatedOrgId && !organization2) {
      return { ok: false, status: 403, code: "ORGANIZATION_INACTIVE", error: "La organizacion no existe o no esta activa" };
    }
    if (organization2) {
      const pilotAccess2 = evaluateControlledPilotHumanAccess({ organization: organization2, user, account: null, isSuperAdmin: true });
      if (!pilotAccess2.ok) return pilotAccess2;
    }
    return {
      ok: true,
      organizationId: impersonatedOrgId || null,
      role: impersonatedOrgId ? "ORG_ADMIN" : "SUPER_ADMIN",
      persistedRole: "SUPER_ADMIN",
      normalizedRole: impersonatedOrgId ? "ORG_ADMIN" : null,
      capabilities: impersonatedOrgId ? getRoleCapabilities("ORG_ADMIN") : [],
      scope: impersonatedOrgId ? "ORGANIZATION" : "PLATFORM",
      branchId: null,
      principalClass: impersonatedOrgId ? "HUMAN_MEMBER" : "PLATFORM_ADMIN",
      presetVersion: AUTHORIZATION_PRESET_VERSION,
      organization: organization2,
      branch: null,
      account: null,
      isSuperAdmin: true,
      isImpersonating: Boolean(impersonatedOrgId),
      identity
    };
  }
  const activeAccounts = identity.activeMemberships;
  const persistedOrgId = identity.user.organization_id;
  const requestedOrgId = organizationHint || persistedOrgId || null;
  const matchingAccounts = requestedOrgId ? activeAccounts.filter((candidate) => candidate.organization_id === requestedOrgId) : [];
  if (matchingAccounts.length > 1) {
    return {
      ok: false,
      status: 409,
      code: "MEMBERSHIP_AMBIGUOUS",
      error: "Existen multiples membresias activas para la organizacion"
    };
  }
  const account = requestedOrgId ? matchingAccounts[0] || null : activeAccounts.length === 1 ? activeAccounts[0] : null;
  if (!account) {
    const error = activeAccounts.length > 1 ? "Selecciona una organizacion valida antes de continuar" : "No existe una membresia activa para esta organizacion";
    return { ok: false, status: 403, error };
  }
  const normalizedRole = normalizeTenantRole(account.role);
  if (!normalizedRole) {
    return { ok: false, status: 403, code: "ROLE_UNKNOWN", error: "La membresia tiene un rol no autorizado" };
  }
  const normalizedAllowedRoles = allowedRoles.map(normalizeTenantRole).filter(Boolean);
  if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedRole)) {
    return { ok: false, status: 403, error: "Tu rol no permite realizar esta accion" };
  }
  const organization = await loadActiveOrganization(base44, account.organization_id);
  if (!organization) {
    return { ok: false, status: 403, code: "ORGANIZATION_INACTIVE", error: "La organizacion no existe o no esta activa" };
  }
  const pilotAccess = evaluateControlledPilotHumanAccess({ organization, user, account, isSuperAdmin: false });
  if (!pilotAccess.ok) return pilotAccess;
  const scope = getRoleScope(normalizedRole);
  const effectiveBranchId = pilotAccess.pilotMode ? pilotAccess.branchId : account.branch_id;
  const branch = scope === "SINGLE_BRANCH" || pilotAccess.pilotMode ? await loadActiveBranch(base44, account.organization_id, effectiveBranchId) : null;
  if ((scope === "SINGLE_BRANCH" || pilotAccess.pilotMode) && !branch) {
    return { ok: false, status: 403, code: "BRANCH_INACTIVE", error: "La sucursal canonica no existe o no esta activa" };
  }
  return {
    ok: true,
    organizationId: account.organization_id,
    role: normalizedRole,
    persistedRole: account.role,
    normalizedRole,
    capabilities: getRoleCapabilities(normalizedRole),
    scope,
    branchId: branch?.id || null,
    principalClass: "HUMAN_MEMBER",
    presetVersion: AUTHORIZATION_PRESET_VERSION,
    organization,
    branch,
    account,
    isSuperAdmin: false,
    isImpersonating: false,
    pilotMode: pilotAccess.pilotMode === true,
    pilotOperatorUserId: pilotAccess.operatorUserId || null,
    pilotBranchId: pilotAccess.branchId || null,
    identity
  };
}

// base44/functions/identityGateway/_shared/superAdminAudit.ts
var ALLOWED_ACTIONS = /* @__PURE__ */ new Set([
  "view_org_list",
  "view_org_detail",
  "impersonate_start",
  "impersonate_end",
  "activate_org",
  "deactivate_org",
  "view_logs",
  "create_org",
  "change_plan",
  "update_org",
  "membership_admin"
]);
function clean(value, maxLength) {
  if (value === null || value === void 0) return null;
  return String(value).trim().slice(0, maxLength);
}
async function appendSuperAdminAudit(base44, user, input = {}) {
  if (!isCanonicalSuperAdmin(user)) {
    const error = new Error("Solo el superadmin canonico puede emitir auditoria administrativa");
    error.code = "SUPERADMIN_REQUIRED";
    throw error;
  }
  if (!ALLOWED_ACTIONS.has(input.action)) {
    const error = new Error("Accion de auditoria no permitida");
    error.code = "AUDIT_ACTION_INVALID";
    throw error;
  }
  const correlationId = clean(input.correlationId, 160) || crypto.randomUUID();
  return base44.asServiceRole.entities.SuperAdminAudit.create({
    super_admin_id: user.id,
    super_admin_email: user.email,
    action: input.action,
    target_organization_id: clean(input.organizationId, 160),
    target_organization_name: clean(input.organizationName, 240),
    context: clean(input.context, 2e3),
    recorded_at: (/* @__PURE__ */ new Date()).toISOString(),
    correlation_id: correlationId,
    metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 8e3) : null
  });
}

// base44/functions/identityGateway/_shared/auditEvent.ts
var MAX_TEXT = 240;
function clean2(value, max = MAX_TEXT) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function immutableIdentity(event) {
  return stable({
    event_type: event.event_type,
    principal_class: event.principal_class,
    actor_user_id: event.actor_user_id,
    effective_technician_user_id: event.effective_technician_user_id,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    command_policy_id: event.command_policy_id,
    operation_semantics: event.operation_semantics || {}
  });
}
function assertCompatible(existing, candidate) {
  if (JSON.stringify(immutableIdentity(existing)) === JSON.stringify(immutableIdentity(candidate))) return;
  const error = new Error("AUDIT_OPERATION_ID_COLLISION");
  error.code = "AUDIT_OPERATION_ID_COLLISION";
  throw error;
}
async function findExisting(base44, event) {
  const existing = await base44.asServiceRole.entities.AuditEvent.filter({
    organization_id: event.organization_id,
    audit_operation_id: event.audit_operation_id
  }, "-created_date", 2);
  if (existing?.length > 1) {
    for (const record of existing) assertCompatible(record, event);
    const error = new Error("AUDIT_OPERATION_ID_AMBIGUOUS");
    error.code = "AUDIT_OPERATION_ID_AMBIGUOUS";
    throw error;
  }
  if (existing?.length === 1) {
    assertCompatible(existing[0], event);
    return existing[0];
  }
  return null;
}
function buildAuditEvent(input) {
  const event = {
    event_type: clean2(input.eventType),
    principal_class: clean2(input.principalClass),
    actor_user_id: clean2(input.actorUserId),
    actor_primary_role: clean2(input.actorPrimaryRole),
    effective_technician_user_id: clean2(input.effectiveTechnicianUserId),
    organization_id: clean2(input.organizationId),
    branch_id: clean2(input.branchId),
    resource_type: clean2(input.resourceType),
    resource_id: clean2(input.resourceId),
    command_policy_id: clean2(input.commandPolicyId),
    correlation_id: clean2(input.correlationId),
    external_correlation_id: clean2(input.externalCorrelationId || input.correlationId),
    audit_operation_id: clean2(input.auditOperationId),
    operation_key: clean2(input.operationKey),
    operation_semantics: cleanObject(input.operationSemantics),
    outcome: clean2(input.outcome) || "COMMITTED",
    prior_state: cleanObject(input.priorState),
    new_state: cleanObject(input.newState),
    custody_snapshot: cleanObject(input.custodySnapshot),
    metadata: cleanObject(input.metadata),
    occurred_at: input.occurredAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  for (const field of ["event_type", "principal_class", "organization_id", "resource_type", "resource_id", "command_policy_id", "correlation_id", "audit_operation_id"]) {
    if (!event[field]) throw new Error(`AUDIT_EVENT_FIELD_REQUIRED:${field}`);
  }
  return event;
}
var AUDIT_LEASE_MS = 6e4;
var AUDIT_WAIT_MS = 8e3;
var AUDIT_RETRY_MS = 55;
var auditWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function auditLockError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
async function lockAuditOrganization(base44, organizationId) {
  const orgs = base44.asServiceRole.entities.Organization;
  if (!orgs?.filter || !orgs?.updateMany) throw auditLockError("AUDIT_LOCK_UNAVAILABLE");
  const token = crypto.randomUUID();
  const until = Date.now() + AUDIT_WAIT_MS;
  while (Date.now() <= until) {
    const now = Date.now();
    const lockData = { audit_lock_token: token, audit_lock_at: new Date(now).toISOString() };
    let claim;
    try {
      claim = await orgs.updateMany({
        id: organizationId,
        $or: [
          { audit_lock_token: { $exists: false } },
          { audit_lock_token: null },
          { audit_lock_token: "" }
        ]
      }, { $set: lockData });
    } catch (error) {
      const org2 = (await orgs.filter({ id: organizationId }, "-created_date", 1))?.[0];
      if (org2?.audit_lock_token === token) return { token, orgs };
      throw auditLockError("AUDIT_LOCK_WRITE_UNCERTAIN");
    }
    if (claim?.updated === 1) return { token, orgs };
    const org = (await orgs.filter({ id: organizationId }, "-created_date", 1))?.[0];
    if (!org) throw auditLockError("AUDIT_ORGANIZATION_NOT_FOUND");
    if (org.audit_lock_token === token) return { token, orgs };
    const lockedAt = Date.parse(org.audit_lock_at || "");
    if (org.audit_lock_token && Number.isFinite(lockedAt) && now - lockedAt > AUDIT_LEASE_MS) {
      const recovered = await orgs.updateMany({
        id: organizationId,
        audit_lock_token: org.audit_lock_token,
        audit_lock_at: org.audit_lock_at
      }, { $set: lockData });
      if (recovered?.updated === 1) return { token, orgs };
    }
    if (Date.now() >= until) break;
    await auditWait(Math.min(AUDIT_RETRY_MS, until - Date.now()));
  }
  throw auditLockError("AUDIT_LOCK_TIMEOUT");
}
async function appendAuditEvent(base44, input) {
  const event = buildAuditEvent(input);
  const lock = await lockAuditOrganization(base44, event.organization_id);
  try {
    const existing = await findExisting(base44, event);
    if (existing) return { event: existing, duplicate: true };
    try {
      const created = await base44.asServiceRole.entities.AuditEvent.create(event);
      return { event: created, duplicate: false };
    } catch (error) {
      const reconciled = await findExisting(base44, event);
      if (reconciled) return { event: reconciled, duplicate: true, reconciled: true };
      throw error;
    }
  } finally {
    try {
      const released = await lock.orgs.updateMany({
        id: event.organization_id,
        audit_lock_token: lock.token
      }, { $unset: { audit_lock_token: "", audit_lock_at: "" } });
      if (released?.updated !== 1) {
        console.warn("[auditEvent] Audit lock owner changed during operation");
      }
    } catch (error) {
      console.error("[auditEvent] Audit lock release uncertain", error?.message);
    }
  }
}

// base44/functions/identityGateway/_shared/dataProjections.ts
var ALLOWLISTS = Object.freeze({
  WORK_ORDER_LIST_OPERATIONAL: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "cliente_id", "tecnico_asignado_id", "motivo_ingreso"],
  WORK_ORDER_TEAM_AWARENESS: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "tecnico_asignado_id", "motivo_ingreso", "diagnostico_resumido", "ultima_actividad", "ultima_actividad_at"],
  WORK_ORDER_ASSIGNED_TECHNICAL: ["id", "codigo_ot", "organization_id", "branch_id", "cliente_id", "equipo_id", "serie_ingreso", "accesorios_ingreso", "estado_fisico_ingreso", "estado", "prioridad", "tipo_ingreso", "tecnico_asignado_id", "tecnico_revisor_id", "estado_atencion", "ultima_actividad", "ultima_actividad_at", "motivo_pausa", "motivo_ingreso", "observaciones_ingreso", "diagnostico_resumido", "fecha_ingreso", "fecha_revision_inicio", "fecha_diagnostico", "diagnostico_habilitado", "motivo_bloqueo_diagnostico", "qa_cycle_started_at"],
  RECEPTION_CUSTOMER: ["id", "nombre_completo", "identificacion", "tipo_cliente", "telefono", "email", "direccion"],
  RECEPTION_EQUIPMENT: ["id", "cliente_id", "tipo", "marca", "modelo", "serie", "estado_fisico", "accesorios"],
  RECEPTION_WORK_ORDER: ["id", "codigo_ot", "cliente_id", "equipo_id", "estado", "branch_id", "motivo_ingreso", "observaciones_ingreso", "tipo_ingreso", "fecha_ingreso", "terminos_aceptados", "terminos_aceptados_at", "terminos_version"],
  CUSTOMER_SERVICE_WORK_ORDER: ["id", "codigo_ot", "branch_id", "cliente_id", "equipo_id", "estado", "prioridad", "tipo_ingreso", "fecha_entrega_estimada", "motivo_ingreso", "diagnostico_resumido", "fecha_ingreso", "cliente_aprobado"],
  CUSTOMER_SERVICE_APPOINTMENT: ["id", "branch_id", "cliente_id", "tipo", "fecha", "hora_inicio", "hora_fin", "tecnico_asignado_id", "estado", "motivo", "orden_trabajo_id", "recordatorio_enviado"],
  INVENTORY_READ_CONTEXT: ["id", "branch_id", "codigo_interno", "codigo_barras", "sku", "nombre", "descripcion", "categoria_id", "tipo_item", "marca", "modelo", "cantidad_disponible", "cantidad_reservada", "ubicacion", "precio_venta", "punto_reorden", "estado", "compatibilidades"],
  INVENTORY_ADMIN_ADDITIONAL: ["costo_unitario", "proveedor", "fecha_compra", "documento_compra", "garantia_proveedor_meses", "garantia_proveedor_vence", "numero_serie", "fecha_ultimo_movimiento"],
  CUSTOMER_MESSAGE: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "tipo", "asunto", "contenido", "canal", "enviado", "enviado_at", "created_date"],
  SALE_CUSTOMER_CONTEXT: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "estado", "subtotal", "descuento_total", "impuesto", "total", "saldo_pendiente", "fecha_venta", "created_date"],
  QUOTE_CUSTOMER_CONTEXT: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "estado", "items", "subtotal", "descuento_total", "impuesto", "total", "cliente_decision_status", "saldo_pendiente", "created_date"],
  WORK_ORDER_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "codigo_ot",
    "estado",
    "estado_atencion",
    "prioridad",
    "cliente_id",
    "equipo_id",
    "tecnico_asignado_id",
    "tecnico_asignado_email",
    "motivo_ingreso",
    "diagnostico_resumido",
    "ultima_actividad",
    "ultima_actividad_at",
    "fecha_ingreso",
    "fecha_revision_inicio",
    "fecha_diagnostico",
    "fecha_cierre",
    "fecha_entrega",
    "cliente_aprobado",
    "cliente_aprobado_at",
    "estado_custodia",
    "fecha_ultimo_contacto",
    "fecha_abandono"
  ],
  DELIVERY_LOG_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "work_order_id",
    "orden_trabajo_id",
    "status",
    "delivered_at",
    "acceptance",
    "warranty_outcome",
    "warranty_id"
  ],
  WARRANTY_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "cliente_id",
    "origen_tipo",
    "origen_id",
    "fecha_emision",
    "fecha_inicio",
    "fecha_fin",
    "estado",
    "texto_snapshot"
  ]
});
function pickProjection(source, fields) {
  const output = {};
  for (const field of fields) {
    if (source?.[field] !== void 0) output[field] = source[field];
  }
  return output;
}
var OPERATIONAL_MUTATION_IDENTITY_FIELDS = Object.freeze([
  "id",
  "organization_id",
  "branch_id",
  "created_date",
  "created_at",
  "updated_date",
  "updated_at"
]);
var OPERATIONAL_READ_FIELDS = Object.freeze({
  ActividadTecnica: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "tecnico_email", "tipo_actividad", "subtipo", "inventario_id", "inventario_cantidad", "inventory_consumption_status", "estado", "started_at", "ended_at", "duracion_minutos", "causa_bloqueo", "resultado", "notas", "soft_deleted", "created_date", "updated_date"],
  BloqueoTecnico: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "tipo_bloqueo", "descripcion", "estado", "resuelto_at", "resuelto_por", "created_date", "updated_date"],
  Branch: ["id", "organization_id", "name", "address", "phone", "active", "is_primary", "created_date", "updated_date"],
  CategoriaInventario: ["id", "organization_id", "nombre", "permite_stock", "permite_precio", "es_vendible", "activo", "created_date", "updated_date"],
  Cita: ["id", "organization_id", "branch_id", "cliente_id", "tipo", "fecha", "hora_inicio", "hora_fin", "tecnico_asignado_id", "tecnico_asignado_email", "estado", "motivo", "orden_trabajo_id", "notas", "recordatorio_enviado", "enlace_videollamada", "created_date", "updated_date"],
  Cliente: ["id", "organization_id", "branch_id", "nombre_completo", "identificacion", "tipo_cliente", "telefono", "email", "direccion", "notas", "created_date", "updated_date"],
  ComprobanteVentaLog: ["id", "organization_id", "venta_id", "accion", "canal", "formato", "destinatario", "notas", "created_date"],
  Cotizacion: ["id", "organization_id", "branch_id", "cliente_id", "vendedor_id", "vendedor_nombre", "orden_trabajo_id", "diagnostico_tecnico_id", "version", "items", "subtotal", "descuento_total", "impuesto", "total", "estado", "estado_conversion", "venta_id", "convertida_at", "requiere_aprobacion", "aprobada_por", "aprobada_at", "aprobacion_interna_status", "aprobacion_interna_motivo", "enviada_at", "valida_hasta", "notas", "terminos_version_aceptada", "cliente_rechazo_motivo", "created_date", "updated_date"],
  DiagnosticMasterRecord: ["id", "organization_id", "orden_trabajo_id", "dmr_number", "created_at", "document_status", "version", "replaces_dmr_id", "cliente_snapshot", "activo_snapshot", "contexto_recepcion", "legal_snapshot", "diagnostico_snapshot", "pdf_url", "signed_at", "voided_at", "replaced_at", "created_date", "updated_date"],
  Diagnostico: ["id", "organization_id", "orden_trabajo_id", "cliente_id", "equipo_id", "tecnico_id", "tipo_diagnostico", "estado_diagnostico", "conclusion_tecnica", "resumen_cliente", "nivel_riesgo", "propuesta_precio_total", "propuesta_precio_detalle", "completed_at", "created_date", "updated_date"],
  DiagnosticoDocumento: ["id", "diagnostico_id", "organization_id", "version", "formato", "url_documento", "estado", "emitido_at", "snapshot_data", "aprobacion_status", "aprobacion_at", "aprobacion_canal", "anulado_at", "canal_envio", "enviado_at", "metodo_aprobacion", "created_date", "updated_date"],
  DiagnosticoEvidencia: ["id", "diagnostico_id", "organization_id", "tipo", "url", "contenido_texto", "descripcion", "created_date", "updated_date"],
  DiagnosticoResultado: ["id", "diagnostico_id", "organization_id", "categoria", "descripcion_item", "resultado", "observaciones", "created_date", "updated_date"],
  DiagnosticoTecnico: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "estado", "tipo_intervencion", "componentes_revisar", "pruebas_realizadas", "hallazgos", "causa_probable", "trabajo_recomendado", "riesgos_no_reparar", "tiempo_estimado_horas", "repuestos_requeridos", "fecha_inicio", "fecha_completado", "bloqueado", "created_date", "updated_date"],
  EntregaLog: ["id", "organization_id", "branch_id", "orden_trabajo_id", "delivered_at", "acceptance", "checkbox_texto_legal", "nota_entrega", "entrega_con_saldo_pendiente", "delivery_status", "delivery_warranty_outcome", "warranty_id", "intervention_type", "created_date"],
  Equipo: ["id", "organization_id", "branch_id", "cliente_id", "tipo", "marca", "modelo", "serie", "estado_fisico", "accesorios", "fotos", "created_date", "updated_date"],
  Expense: ["id", "organization_id", "branch_id", "date", "amount", "category", "frequency", "is_fixed", "description", "payment_method", "created_date", "updated_date"],
  Garantia: ["id", "organization_id", "branch_id", "cliente_id", "origen_tipo", "origen_id", "equipo_id", "fecha_emision", "fecha_inicio", "fecha_fin", "estado", "texto_snapshot", "activated_at", "created_date", "updated_date"],
  Inventario: ["id", ...ALLOWLISTS.INVENTORY_READ_CONTEXT, "created_date", "updated_date"],
  InventarioHistorial: ["id", "organization_id", "branch_id", "inventario_id", "inventory_id", "movement_type", "quantity", "quantity_delta", "available_delta", "reserved_delta", "available_before", "available_after", "reserved_before", "reserved_after", "reference_type", "reference_id", "work_order_id", "quote_id", "reservation_id", "effective_at", "campo", "valor_anterior", "valor_nuevo", "motivo", "sale_id", "created_date"],
  InventarioReserva: ["id", "organization_id", "branch_id", "work_order_id", "inventario_id", "inventory_id", "quote_id", "quantity", "state", "reserved_at", "consumed_at", "released_at", "returned_at", "failure_compensated", "created_date", "updated_date"],
  NoConformidad: ["id", "organization_id", "branch_id", "titulo", "tipo", "descripcion", "orden_trabajo_id", "venta_id", "reportado_por", "severidad", "estado", "causa_raiz", "accion_correctiva", "responsable_accion", "fecha_limite", "fecha_cierre", "verificacion_eficacia", "leccion_aprendida", "created_date", "updated_date"],
  NotaInterna: ["id", "organization_id", "orden_trabajo_id", "autor_id", "autor_nombre", "contenido", "menciones", "tipo", "created_date", "updated_date"],
  Notificacion: ["id", "organization_id", "branch_id", "user_id", "role_target", "tipo", "mensaje", "referencia_ot_id", "accion_sugerida", "estado", "created_date", "updated_date"],
  OTEvent: ["id", "organization_id", "orden_trabajo_id", "tipo", "sale_id", "venta_total", "tipo_concepto", "detalle", "processed", "created_at", "created_date"],
  OrdenTrabajo: [...ALLOWLISTS.WORK_ORDER_ASSIGNED_TECHNICAL, "tracking_code", "responsable_recepcion", "fecha_entrega_estimada", "created_date", "updated_date", "cliente_aprobado", "cliente_aprobado_at", "revision_pagada_at", "revision_venta_id", "estado_custodia", "fecha_inicio_custodia", "fecha_ultimo_contacto", "fecha_abandono", "abandono_observaciones"],
  PreDiagnostico: ["id", "organization_id", "orden_trabajo_id", "estado", "respuestas", "completado_at", "created_date", "updated_date"],
  PruebaTecnica: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "technical_activity_segment_id", "qa_cycle_id", "qa_cycle_started_at", "recorded_at", "tipo_prueba", "descripcion", "resultado", "observaciones", "evidencia_urls", "created_date"],
  PurchaseInvoice: ["id", "organization_id", "branch_id", "supplier_id", "invoice_number", "date", "due_date", "total_amount", "paid_amount", "notes", "created_date", "updated_date"],
  Reciclaje: ["id", "organization_id", "branch_id", "tipo_residuo", "descripcion", "peso_kg", "cantidad_unidades", "origen", "orden_trabajo_id", "accion", "destino", "empresa_recicladora", "fecha_proceso", "huella_carbono_evitada_kg", "valor_recuperado", "certificado_url", "notas", "created_date", "updated_date"],
  RegistroTiempo: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "actividad", "inicio", "fin", "duracion_minutos", "tipo_actividad", "created_date", "updated_date"],
  Servicio: ["id", "organization_id", "nombre", "descripcion", "precio", "activo", "categoria", "created_date", "updated_date"],
  SolicitudTecnica: ["id", "organization_id", "branch_id", "orden_trabajo_id", "tecnico_id", "tipo", "descripcion", "cantidad", "estado", "motivo_rechazo", "aprobado_at", "entregado_at", "inventario_id", "fulfillment_mode", "requested_at", "rejected_at", "fulfilled_at", "fulfillment_status", "fulfillment_error", "created_date", "updated_date"],
  Supplier: ["id", "organization_id", "name", "contact_name", "phone", "email", "address", "tax_id", "payment_terms_days", "active", "created_date", "updated_date"],
  SupplierPayment: ["id", "organization_id", "branch_id", "purchase_invoice_id", "amount", "date", "method", "reference", "notes", "created_date"],
  TerminosYCondiciones: ["id", "organization_id", "version", "texto", "activo", "created_date", "updated_date"],
  Venta: ["id", "organization_id", "branch_id", "cliente_id", "origen_venta", "origen_detalle", "tipo_concepto", "referencia_ot_id", "referencia_diagnostico_id", "cotizacion_id", "cotizacion_total_original", "cotizacion_subtotal_original", "cotizacion_descuento_original", "total", "subtotal", "impuesto", "descuento_total", "metodo_pago", "estado", "notas", "created_date", "updated_date"],
  VentaItem: ["id", "organization_id", "venta_id", "tipo", "referencia_id", "descripcion", "cantidad", "precio_unitario", "subtotal", "created_date"],
  WorkflowGate: ["id", "organization_id", "subject_type", "subject_id", "wait_reason", "provider_key", "status", "resolved_at", "created_date", "updated_date"]
});
var projectSuperAdminAudit = (event) => pickProjection(event, [
  "id",
  "super_admin_id",
  "super_admin_email",
  "action",
  "target_organization_id",
  "target_organization_name",
  "context",
  "recorded_at",
  "correlation_id",
  "created_date"
]);

// base44/functions/identityGateway/_shared/tenantProvisioning.ts
var BASE_INVENTORY_CATEGORIES = Object.freeze([
  { nombre: "Servicios", permite_stock: false, permite_precio: true, es_vendible: true },
  { nombre: "Repuestos", permite_stock: true, permite_precio: true, es_vendible: true },
  { nombre: "Equipos / Portatiles", permite_stock: true, permite_precio: true, es_vendible: true },
  { nombre: "Accesorios", permite_stock: true, permite_precio: true, es_vendible: true },
  { nombre: "Reciclaje", permite_stock: true, permite_precio: false, es_vendible: false }
]);
function canonicalOrganizationData(input, correlationId) {
  return {
    ...input,
    status: "active",
    authorization_preset_version: AUTHORIZATION_PRESET_VERSION,
    custom_grants_enabled: false,
    provisioning_status: "PENDING",
    provisioning_correlation_id: correlationId,
    inventario_config: input.inventario_config || { dias_dinero_dormido: 90 },
    garantia_config: input.garantia_config || {},
    saldo_caja_inicial: Number(input.saldo_caja_inicial || 0),
    saldo_caja_actual: Number(input.saldo_caja_actual || 0),
    marketing_spend: Number(input.marketing_spend || 0)
  };
}
function canonicalPrimaryBranchData(organizationId) {
  return { organization_id: organizationId, name: "Sucursal Principal", normalized_name: "sucursal principal", active: true, is_primary: true };
}
function canonicalOwnerMembershipData({ organizationId, userId = null, email, status }) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    user_id: userId,
    user_email: email,
    organization_id: organizationId,
    branch_id: null,
    role: "ORG_ADMIN",
    status,
    active: status === "active",
    ...status === "active" ? { accepted_at: now } : { invited_at: now }
  };
}
async function seedBaselineCategories(base44, organizationId, created = []) {
  const records = [];
  for (const category of BASE_INVENTORY_CATEGORIES) {
    const existing = await base44.asServiceRole.entities.CategoriaInventario.filter({ organization_id: organizationId, nombre: category.nombre }, "-created_date", 2);
    if (existing?.length > 1) throw new Error(`PROVISIONING_CATEGORY_AMBIGUOUS:${category.nombre}`);
    if (existing?.length === 1) {
      records.push(existing[0]);
      continue;
    }
    const record = await base44.asServiceRole.entities.CategoriaInventario.create({ ...category, organization_id: organizationId, activo: true });
    created.push({ entity: "CategoriaInventario", id: record.id });
    records.push(record);
  }
  return records;
}
async function validateTenantReadiness(base44, organizationId, { requireReadyMarker = true } = {}) {
  const [organizations, branches, accounts, categories] = await Promise.all([
    base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 2),
    base44.asServiceRole.entities.Branch.filter({ organization_id: organizationId, active: true }, "-created_date", 500),
    base44.asServiceRole.entities.UserAccount.filter({ organization_id: organizationId, role: "ORG_ADMIN" }, "-created_date", 500),
    base44.asServiceRole.entities.CategoriaInventario.filter({ organization_id: organizationId, activo: true }, "-created_date", 500)
  ]);
  const organization = organizations?.length === 1 ? organizations[0] : null;
  const primaryBranches = (branches || []).filter((branch) => branch.is_primary === true || branch.normalized_name === "sucursal principal");
  const owners = (accounts || []).filter((account) => ["active", "invited"].includes(account.status) && !account.branch_id);
  const categoryNames = new Set((categories || []).map((category) => category.nombre));
  const missingCategories = BASE_INVENTORY_CATEGORIES.map((category) => category.nombre).filter((name) => !categoryNames.has(name));
  const checks = {
    organization_active: organization?.status === "active",
    primary_branch_active: primaryBranches.length === 1,
    owner_org_admin: owners.length >= 1,
    owner_organization_wide: owners.every((owner) => !owner.branch_id),
    baseline_categories: missingCategories.length === 0,
    preset_version: organization?.authorization_preset_version === AUTHORIZATION_PRESET_VERSION,
    custom_grants_disabled: organization?.custom_grants_enabled === false,
    provisioning_ready: !requireReadyMarker || organization?.provisioning_status === "READY"
  };
  return {
    ready: Object.values(checks).every(Boolean),
    organization_id: organizationId,
    preset_version: AUTHORIZATION_PRESET_VERSION,
    checks,
    missing_categories: missingCategories,
    primary_branch_ids: primaryBranches.map((branch) => branch.id),
    owner_account_ids: owners.map((account) => account.id)
  };
}

// base44/functions/identityGateway/_shared/entitlementAuthority.ts
var ENTITLEMENT_POLICY_VERSION = "2026-09-c4-v1";
var LEGACY_PACKAGE_FALLBACK = Object.freeze({
  basic: "core",
  pro: "advanced",
  premium: "advanced"
});
var PACKAGE_DEFAULTS = Object.freeze({
  core: {
    capabilities: [
      "CORE_WORKFLOW",
      "ASSET_LIFECYCLE",
      "CUSTOMER_PORTAL",
      "BASIC_BUSINESS_READ",
      "OPERATIONAL_TRACEABILITY"
    ],
    limits: {}
  },
  advanced: {
    capabilities: [
      "CORE_WORKFLOW",
      "ASSET_LIFECYCLE",
      "CUSTOMER_PORTAL",
      "BASIC_BUSINESS_READ",
      "OPERATIONAL_TRACEABILITY",
      "ADVANCED_MULTI_BRANCH",
      "ADVANCED_ANALYTICS",
      "ADVANCED_OPERATIONAL_SUPERVISION",
      "QUALITY_NONCONFORMITY",
      "RECYCLING",
      "ADVANCED_CRM",
      "ADVANCED_AUTOMATION"
    ],
    limits: {}
  },
  enterprise: {
    capabilities: [
      "CORE_WORKFLOW",
      "ASSET_LIFECYCLE",
      "CUSTOMER_PORTAL",
      "BASIC_BUSINESS_READ",
      "OPERATIONAL_TRACEABILITY",
      "ADVANCED_MULTI_BRANCH",
      "ADVANCED_ANALYTICS",
      "ADVANCED_OPERATIONAL_SUPERVISION",
      "QUALITY_NONCONFORMITY",
      "RECYCLING",
      "ADVANCED_CRM",
      "ADVANCED_AUTOMATION",
      "ENTERPRISE_ASSET_CUSTODY",
      "ENTERPRISE_ONBOARDING",
      "ENTERPRISE_OFFBOARDING",
      "ENTERPRISE_COMMAND_EVIDENCE"
    ],
    limits: {}
  }
});
function normalizePackageId(packageId) {
  const normalized = String(packageId || "").trim().toLowerCase();
  if (Object.hasOwn(PACKAGE_DEFAULTS, normalized)) return normalized;
  return LEGACY_PACKAGE_FALLBACK[normalized] || null;
}
function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function isCurrentlyEffective(policy, now = /* @__PURE__ */ new Date()) {
  if (!policy) return false;
  const from = policy.effective_from ? new Date(policy.effective_from) : null;
  const until = policy.effective_until ? new Date(policy.effective_until) : null;
  if (from && Number.isFinite(from.getTime()) && from > now) return false;
  if (until && Number.isFinite(until.getTime()) && until <= now) return false;
  return true;
}
async function resolveEffectiveEntitlement(base44, organization) {
  if (!organization?.id) return null;
  const policies = await base44.asServiceRole.entities.EntitlementPolicy.filter(
    { organization_id: organization.id },
    "-created_date",
    20
  );
  const explicit = (policies || []).find((policy) => isCurrentlyEffective(policy));
  const packageId = explicit?.package_id || LEGACY_PACKAGE_FALLBACK[organization.plan] || "core";
  const defaults = PACKAGE_DEFAULTS[packageId] || PACKAGE_DEFAULTS.core;
  const overrideCapabilities = Array.isArray(explicit?.overrides?.capabilities) ? explicit.overrides.capabilities : [];
  const deniedCapabilities = new Set(
    Array.isArray(explicit?.overrides?.denied_capabilities) ? explicit.overrides.denied_capabilities : []
  );
  const capabilities = unique([
    ...defaults.capabilities,
    ...Array.isArray(explicit?.capabilities) ? explicit.capabilities : [],
    ...overrideCapabilities
  ]).filter((capability) => !deniedCapabilities.has(capability));
  return {
    package_id: packageId,
    billing_status: explicit?.billing_status || (organization.status === "suspended" ? "suspended" : "active"),
    billing_interval: explicit?.billing_interval || null,
    license_status: explicit?.license_status || (explicit ? "pending" : "active"),
    activated_at: explicit?.activated_at || null,
    activation_method: explicit?.activation_method || (explicit ? null : "migration"),
    current_period_start: explicit?.current_period_start || null,
    current_period_end: explicit?.current_period_end || null,
    renewal_at: explicit?.renewal_at || null,
    grace_until: explicit?.grace_until || null,
    cancel_at_period_end: explicit?.cancel_at_period_end === true,
    billing_provider: explicit?.billing_provider || null,
    policy_version: explicit?.policy_version || ENTITLEMENT_POLICY_VERSION,
    capabilities,
    limits: {
      ...defaults.limits,
      ...explicit?.limits || {},
      ...explicit?.overrides?.limits || {}
    },
    source: explicit ? "explicit_policy" : "legacy_compatibility",
    legacy_plan: organization.plan || null,
    effective_from: explicit?.effective_from || null,
    effective_until: explicit?.effective_until || null,
    policy_id: explicit?.id || null
  };
}

// base44/functions/identityGateway/entry.ts
var ORG_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES", "INVENTORY", "CUSTOMER_SERVICE", "SUPPORT"];
var ORG_UPDATE_FIELDS = /* @__PURE__ */ new Set([
  "name",
  "legal_name",
  "country",
  "currency",
  "telefono_negocio",
  "logo_url",
  "email",
  "direccion_comercial",
  "tipo_entidad",
  "identificacion_fiscal",
  "direccion_fiscal",
  "public_base_url",
  "garantia_config",
  "saldo_caja_inicial",
  "saldo_caja_actual",
  "ultima_actualizacion_caja",
  "inventario_config",
  "marketing_spend"
]);
var ADMIN_ORG_UPDATE_FIELDS = /* @__PURE__ */ new Set(["status", "plan", ...ORG_UPDATE_FIELDS]);
function jsonError(error, status, code = void 0) {
  return Response.json({ error, ...code ? { code } : {} }, { status });
}
function clean3(value, maxLength = 500) {
  if (value === null || value === void 0) return "";
  return String(value).trim().slice(0, maxLength);
}
function pick(input, fields) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (fields.has(key)) output[key] = value;
  }
  return output;
}
async function loadOrganizations(base44, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const organizations = [];
  for (const id of uniqueIds) {
    const found = await base44.asServiceRole.entities.Organization.filter({ id }, "-created_date", 1);
    if (found?.[0]) organizations.push(found[0]);
  }
  return organizations;
}
async function persistUserIdentity(base44, userId, data) {
  return base44.asServiceRole.entities.User.update(userId, data);
}
async function loadBackendUser(base44, userId) {
  const users = await base44.asServiceRole.entities.User.filter({ id: userId }, "-created_date", 1);
  return users?.[0] || null;
}
function controlledPilotSnapshot(organization) {
  return {
    controlled_pilot_mode: organization?.controlled_pilot_mode === true,
    controlled_pilot_operator_user_id: organization?.controlled_pilot_operator_user_id || null,
    controlled_pilot_branch_id: organization?.controlled_pilot_branch_id || null,
    controlled_pilot_configured_at: organization?.controlled_pilot_configured_at || null,
    controlled_pilot_configured_by_user_id: organization?.controlled_pilot_configured_by_user_id || null
  };
}
async function contextStep(step, operation) {
  try {
    return await operation();
  } catch (error) {
    console.error("[identityGateway:context-step]", {
      step,
      status: error?.response?.status || error?.status || null
    });
    throw error;
  }
}
async function buildContext(base44, user) {
  const backendUser = await contextStep("LOAD_BACKEND_USER", () => loadBackendUser(base44, user.id));
  const authoritativeUser = backendUser || user;
  let identity = await contextStep("RESOLVE_IDENTITY", () => resolveIdentitySnapshot(base44, authoritativeUser));
  if (!identity.ok) return identity;
  if (identity.isSuperAdmin) {
    if (getUserDataField(authoritativeUser, "is_super_admin") !== true) {
      await contextStep("PERSIST_ADMIN_FLAG", () => persistUserIdentity(base44, authoritativeUser.id, { is_super_admin: true }));
    }
  } else if (identity.activeMemberships.length === 1 && (identity.user.organization_id !== identity.activeMemberships[0].organization_id || getUserDataField(authoritativeUser, "is_super_admin") === true || getUserDataField(authoritativeUser, "impersonating_org_id") || getUserDataField(authoritativeUser, "impersonating_started_at"))) {
    await contextStep("REPAIR_IDENTITY_FLAGS", () => persistUserIdentity(base44, authoritativeUser.id, {
      organization_id: identity.activeMemberships[0].organization_id,
      impersonating_org_id: null,
      impersonating_started_at: null,
      impersonation_previous_organization_id: null,
      is_super_admin: false
    }));
    const refreshedUser = {
      ...authoritativeUser,
      organization_id: identity.activeMemberships[0].organization_id,
      is_super_admin: false,
      impersonating_org_id: null,
      impersonating_started_at: null,
      impersonation_previous_organization_id: null,
      data: {
        ...authoritativeUser.data || {},
        organization_id: identity.activeMemberships[0].organization_id,
        is_super_admin: false,
        impersonating_org_id: null,
        impersonating_started_at: null,
        impersonation_previous_organization_id: null
      }
    };
    identity = await contextStep("RESOLVE_REPAIRED_IDENTITY", () => resolveIdentitySnapshot(base44, refreshedUser));
  }
  const organizationIds = identity.isSuperAdmin ? [identity.user.impersonating_org_id] : [
    ...identity.activeMemberships.map((account) => account.organization_id),
    ...identity.pendingInvitations.map((account) => account.organization_id)
  ];
  const organizations = await contextStep("LOAD_ORGANIZATIONS", () => loadOrganizations(base44, organizationIds));
  const organizationById = new Map(organizations.map((org) => [org.id, sanitizeOrganization(org)]));
  const authorizationRole = identity.isSuperAdmin ? identity.user.impersonating_org_id ? "ORG_ADMIN" : "SUPER_ADMIN" : normalizeTenantRole(identity.activeAccount?.role);
  const effectiveOrganizationId = identity.isSuperAdmin && identity.user.impersonating_org_id ? identity.user.impersonating_org_id : identity.user.organization_id;
  const activeOrganization = organizations.find((org) => org.id === effectiveOrganizationId) || null;
  const entitlement = activeOrganization ? await contextStep("RESOLVE_ENTITLEMENT", () => resolveEffectiveEntitlement(base44, activeOrganization)) : null;
  return {
    ok: true,
    user: identity.user,
    userAccount: sanitizeUserAccount(identity.activeAccount),
    memberships: identity.activeMemberships.map(sanitizeUserAccount),
    pendingInvitations: identity.pendingInvitations.map((account) => ({
      ...sanitizeUserAccount(account),
      organization: organizationById.get(account.organization_id) || null
    })),
    organizations: organizations.map(sanitizeOrganization),
    entitlement,
    authorization: {
      role: authorizationRole,
      capabilities: authorizationRole === "SUPER_ADMIN" ? [] : [.../* @__PURE__ */ new Set([...getRoleCapabilities(authorizationRole), ...entitlement?.capabilities || []])],
      scope: authorizationRole === "SUPER_ADMIN" ? "PLATFORM" : getRoleScope(authorizationRole),
      preset_version: AUTHORIZATION_PRESET_VERSION,
      controlled_pilot_mode: inspectControlledPilotConfiguration(activeOrganization).enabled
    },
    identityStatus: identity.isSuperAdmin ? null : identity.activeMemberships.length > 1 && !identity.activeAccount ? "MULTI_ORG_REQUIRED" : identity.activeMemberships.length === 0 ? "NO_MEMBERSHIP" : null
  };
}
async function compensate(base44, records) {
  for (const record of [...records].reverse()) {
    try {
      await base44.asServiceRole.entities[record.entity].delete(record.id);
    } catch (error) {
      console.error("[identityGateway] compensation failed", record, error?.message);
    }
  }
}
async function finalizeProvisioning(base44, { organization, branch, account, actor, principalClass, correlationId }) {
  const structural = await validateTenantReadiness(base44, organization.id, { requireReadyMarker: false });
  if (!structural.ready) {
    const error = new Error("PROVISIONING_READINESS_VALIDATION_FAILED");
    error.code = "PROVISIONING_READINESS_VALIDATION_FAILED";
    error.details = structural;
    throw error;
  }
  await appendAuditEvent(base44, {
    eventType: "TENANT_PROVISIONED",
    principalClass,
    actorUserId: actor.id,
    actorPrimaryRole: principalClass === "PLATFORM_ADMIN" ? "SUPER_ADMIN" : "ORG_ADMIN",
    organizationId: organization.id,
    branchId: branch.id,
    resourceType: "Organization",
    resourceId: organization.id,
    commandPolicyId: "CP-PROV-001",
    correlationId,
    auditOperationId: `tenant-provisioning:${organization.id}`,
    operationKey: correlationId,
    newState: { provisioning_status: "READY", owner_account_id: account.id, primary_branch_id: branch.id },
    metadata: { preset_version: structural.preset_version, custom_grants_enabled: false, checks: structural.checks }
  });
  const provisionedAt = (/* @__PURE__ */ new Date()).toISOString();
  const readyOrganization = await base44.asServiceRole.entities.Organization.update(organization.id, {
    provisioning_status: "READY",
    provisioned_at: provisionedAt
  });
  const readiness = await validateTenantReadiness(base44, organization.id);
  if (!readiness.ready) throw Object.assign(new Error("PROVISIONING_READY_MARKER_INVALID"), { code: "PROVISIONING_READY_MARKER_INVALID", details: readiness });
  return { organization: readyOrganization, readiness };
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonError("Metodo no permitido", 405, "METHOD_NOT_ALLOWED");
  let diagnosticStage = "REQUEST_INIT";
  try {
    diagnosticStage = "CLIENT_CREATE";
    const base44 = createClientFromRequest(req);
    diagnosticStage = "AUTH_ME";
    const user = await base44.auth.me();
    if (!user) return jsonError("No autenticado", 401, "AUTH_REQUIRED");
    diagnosticStage = "REQUEST_BODY";
    const body = await req.json().catch(() => ({}));
    const action = body.action || "context";
    diagnosticStage = "ACTION_DISPATCH";
    if (action === "getPublicSiteConfig") {
      const rows = await base44.asServiceRole.entities.PublicSiteConfig.filter({ config_key: "main" }, "-created_date", 1);
      return Response.json({ contact_email: clean3(rows?.[0]?.contact_email, 320) || "" });
    }
    if (action === "adminSetPublicSiteConfig") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Acceso denegado", 403, "SUPERADMIN_REQUIRED");
      const contactEmail = clean3(body.contact_email, 320);
      const rows = await base44.asServiceRole.entities.PublicSiteConfig.filter({ config_key: "main" }, "-created_date", 1);
      const data = { config_key: "main", contact_email: contactEmail, updated_by: user.id, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (rows?.[0]?.id) await base44.asServiceRole.entities.PublicSiteConfig.update(rows[0].id, data);
      else await base44.asServiceRole.entities.PublicSiteConfig.create(data);
      await appendSuperAdminAudit(base44, { actorUser: user, action: "PUBLIC_SITE_CONFIG_UPDATED", targetType: "PublicSiteConfig", targetId: rows?.[0]?.id || "main", metadata: { contact_email_configured: Boolean(contactEmail) } });
      return Response.json({ success: true, contact_email: contactEmail });
    }
    if (action === "context") {
      diagnosticStage = "CONTEXT_BUILD";
      const context = await buildContext(base44, user);
      if (!context.ok) return jsonError(context.error, context.status);
      return Response.json(context);
    }
    if (action === "switchOrganization") {
      if (isCanonicalSuperAdmin(user)) {
        return jsonError("Superadmin debe usar impersonacion autorizada", 403, "IMPERSONATION_REQUIRED");
      }
      const authorization = await resolveAuthorizedContext(base44, user, {
        organizationHint: clean3(body.organization_id, 160),
        allowedRoles: ORG_ROLES
      });
      if (!authorization.ok) return jsonError(authorization.error, authorization.status);
      await persistUserIdentity(base44, user.id, {
        organization_id: authorization.organizationId,
        impersonating_org_id: null,
        impersonating_started_at: null,
        impersonation_previous_organization_id: null,
        is_super_admin: false
      });
      return Response.json({ success: true, organization_id: authorization.organizationId });
    }
    if (action === "acceptInvitation") {
      if (isCanonicalSuperAdmin(user)) return jsonError("Superadmin no acepta membresias de tenant", 403);
      const identity = await resolveIdentitySnapshot(base44, user);
      const invitationId = clean3(body.invitation_id, 160);
      const invitation = identity.pendingInvitations.find(
        (candidate) => !invitationId || candidate.id === invitationId
      );
      if (!invitation) return jsonError("Invitacion no encontrada", 404, "INVITATION_NOT_FOUND");
      const [invitationOrganization] = await base44.asServiceRole.entities.Organization.filter({ id: invitation.organization_id }, "-created_date", 1);
      if (inspectControlledPilotConfiguration(invitationOrganization).enabled) {
        return jsonError("Las membresias estan congeladas durante el piloto controlado", 409, "CONTROLLED_PILOT_MEMBERSHIP_FROZEN");
      }
      const updated = await base44.asServiceRole.entities.UserAccount.update(invitation.id, {
        user_id: user.id,
        status: "active",
        active: true,
        accepted_at: invitation.accepted_at || (/* @__PURE__ */ new Date()).toISOString()
      });
      await persistUserIdentity(base44, user.id, {
        organization_id: invitation.organization_id,
        impersonating_org_id: null,
        impersonating_started_at: null,
        impersonation_previous_organization_id: null,
        is_super_admin: false
      });
      return Response.json({ success: true, account: sanitizeUserAccount(updated) });
    }
    if (action === "bootstrapOrganization") {
      if (isCanonicalSuperAdmin(user)) return jsonError("Superadmin debe usar adminCreateOrganization", 403);
      const identity = await resolveIdentitySnapshot(base44, user);
      if (identity.activeMemberships.length > 0 || identity.pendingInvitations.length > 0) {
        return jsonError("La cuenta ya tiene una membresia o invitacion", 409, "MEMBERSHIP_ALREADY_EXISTS");
      }
      const input = body.organization || {};
      const name = clean3(input.name, 240);
      const country = clean3(input.country, 120);
      const currency = clean3(input.currency, 16).toUpperCase();
      if (!name || !country || !currency) return jsonError("Nombre, pais y moneda son requeridos", 400);
      const created = [];
      try {
        const correlationId = clean3(body.correlation_id, 240) || crypto.randomUUID();
        const organization = await base44.asServiceRole.entities.Organization.create(canonicalOrganizationData({
          name,
          country,
          currency,
          plan: "basic"
        }, correlationId));
        created.push({ entity: "Organization", id: organization.id });
        const account = await base44.asServiceRole.entities.UserAccount.create(canonicalOwnerMembershipData({
          organizationId: organization.id,
          userId: user.id,
          email: user.email,
          status: "active"
        }));
        created.push({ entity: "UserAccount", id: account.id });
        const branch = await base44.asServiceRole.entities.Branch.create(canonicalPrimaryBranchData(organization.id));
        created.push({ entity: "Branch", id: branch.id });
        await seedBaselineCategories(base44, organization.id, created);
        const finalized = await finalizeProvisioning(base44, {
          organization,
          branch,
          account,
          actor: user,
          principalClass: "HUMAN_MEMBER",
          correlationId
        });
        await persistUserIdentity(base44, user.id, {
          organization_id: organization.id,
          impersonating_org_id: null,
          impersonating_started_at: null,
          impersonation_previous_organization_id: null,
          is_super_admin: false
        });
        return Response.json({
          success: true,
          organization: sanitizeOrganization(finalized.organization),
          account: sanitizeUserAccount(account),
          branch,
          readiness: finalized.readiness
        }, { status: 201 });
      } catch (error) {
        await compensate(base44, created);
        throw error;
      }
    }
    if (action === "configureControlledPilot") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const internalUser = await loadBackendUser(base44, user.id);
      if (getUserDataField(internalUser || user, "impersonating_org_id")) {
        return jsonError("Finaliza la impersonacion antes de configurar el piloto", 409, "CONTROLLED_PILOT_IMPERSONATION_ACTIVE");
      }
      const organizationId = clean3(body.organization_id, 160);
      const enabled = body.enabled === true;
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404, "ORGANIZATION_NOT_FOUND");
      const before = controlledPilotSnapshot(organization);
      let changes;
      if (enabled) {
        if (organization.status !== "active") return jsonError("La organizacion debe estar activa", 409, "CONTROLLED_PILOT_ORGANIZATION_INACTIVE");
        const operatorUserId = clean3(body.operator_user_id, 160);
        const branchId = clean3(body.branch_id, 160);
        if (!operatorUserId || !branchId) return jsonError("operator_user_id y branch_id son requeridos", 400, "CONTROLLED_PILOT_CONFIGURATION_INVALID");
        const [accounts, branches] = await Promise.all([
          base44.asServiceRole.entities.UserAccount.filter({ organization_id: organizationId }, "-created_date", 500),
          base44.asServiceRole.entities.Branch.filter({ id: branchId, organization_id: organizationId, active: true }, "-created_date", 2)
        ]);
        const activeAccounts = (accounts || []).filter((account) => account.status === "active");
        const operatorAccount = activeAccounts.find((account) => account.user_id === operatorUserId);
        if (activeAccounts.length !== 1 || !operatorAccount || operatorAccount.role !== "ORG_ADMIN") {
          return jsonError("El piloto requiere exactamente una membresia activa ORG_ADMIN para el operador designado", 409, "CONTROLLED_PILOT_SINGLE_OPERATOR_REQUIRED");
        }
        if (branches?.length !== 1) return jsonError("La sucursal canonica no existe o no esta activa", 409, "CONTROLLED_PILOT_BRANCH_INVALID");
        const now = (/* @__PURE__ */ new Date()).toISOString();
        changes = {
          controlled_pilot_mode: true,
          controlled_pilot_operator_user_id: operatorUserId,
          controlled_pilot_branch_id: branchId,
          controlled_pilot_configured_at: now,
          controlled_pilot_configured_by_user_id: user.id
        };
      } else {
        changes = {
          controlled_pilot_mode: false,
          controlled_pilot_operator_user_id: null,
          controlled_pilot_branch_id: null,
          controlled_pilot_configured_at: (/* @__PURE__ */ new Date()).toISOString(),
          controlled_pilot_configured_by_user_id: user.id
        };
      }
      const updated = await base44.asServiceRole.entities.Organization.update(organization.id, changes);
      try {
        await appendSuperAdminAudit(base44, user, {
          action: "update_org",
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId: body.correlation_id,
          metadata: {
            operation: enabled ? "CONTROLLED_PILOT_ENABLED" : "CONTROLLED_PILOT_DISABLED",
            operator_user_id: changes.controlled_pilot_operator_user_id,
            branch_id: changes.controlled_pilot_branch_id
          }
        });
      } catch (error) {
        await base44.asServiceRole.entities.Organization.update(organization.id, before).catch(() => null);
        throw error;
      }
      return Response.json({
        success: true,
        controlled_pilot: inspectControlledPilotConfiguration(updated)
      });
    }
    if (action === "startImpersonation") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const organizationId = clean3(body.organization_id, 160);
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404);
      if (organization.status !== "active") return jsonError("No se puede impersonar una organizacion suspendida", 409);
      if (inspectControlledPilotConfiguration(organization).enabled) {
        return jsonError("La impersonacion esta deshabilitada durante el piloto controlado", 409, "CONTROLLED_PILOT_IMPERSONATION_DISABLED");
      }
      const internalUser = await loadBackendUser(base44, user.id);
      const previousOrganizationId = getUserDataField(internalUser || user, "organization_id");
      const previousImpersonationId = getUserDataField(internalUser || user, "impersonating_org_id");
      if (previousImpersonationId) {
        return jsonError("Finaliza la impersonacion activa antes de iniciar otra", 409, "IMPERSONATION_ALREADY_ACTIVE");
      }
      const startedAt = (/* @__PURE__ */ new Date()).toISOString();
      await persistUserIdentity(base44, user.id, {
        is_super_admin: true,
        organization_id: organization.id,
        impersonating_org_id: organization.id,
        impersonating_started_at: startedAt,
        impersonation_previous_organization_id: previousOrganizationId || null
      });
      try {
        await appendSuperAdminAudit(base44, user, {
          action: "impersonate_start",
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId: body.correlation_id,
          metadata: { previous_impersonation_id: previousImpersonationId || null }
        });
      } catch (error) {
        await persistUserIdentity(base44, user.id, {
          organization_id: previousOrganizationId || null,
          impersonating_org_id: previousImpersonationId || null,
          impersonating_started_at: null,
          impersonation_previous_organization_id: null
        });
        throw error;
      }
      return Response.json({ success: true, organization: sanitizeOrganization(organization), started_at: startedAt });
    }
    if (action === "endImpersonation") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const internalUser = await loadBackendUser(base44, user.id);
      const authoritativeUser = internalUser || user;
      const organizationId = getUserDataField(authoritativeUser, "impersonating_org_id");
      if (!organizationId) return Response.json({ success: true, idempotent: true });
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      const previousOrganizationId = getUserDataField(authoritativeUser, "impersonation_previous_organization_id");
      const previousStartedAt = getUserDataField(authoritativeUser, "impersonating_started_at");
      await persistUserIdentity(base44, user.id, {
        organization_id: previousOrganizationId || null,
        impersonating_org_id: null,
        impersonating_started_at: null,
        impersonation_previous_organization_id: null,
        is_super_admin: true
      });
      try {
        await appendSuperAdminAudit(base44, user, {
          action: "impersonate_end",
          organizationId,
          organizationName: organization?.name,
          correlationId: body.correlation_id,
          metadata: { started_at: previousStartedAt || null }
        });
      } catch (error) {
        await persistUserIdentity(base44, user.id, {
          organization_id: organizationId,
          impersonating_org_id: organizationId,
          impersonating_started_at: previousStartedAt || (/* @__PURE__ */ new Date()).toISOString(),
          impersonation_previous_organization_id: previousOrganizationId || null
        });
        throw error;
      }
      return Response.json({ success: true });
    }
    if (action === "getOrganization" || action === "updateOrganization" || action === "listAccounts") {
      const authorization = await resolveAuthorizedContext(base44, user, {
        organizationHint: clean3(body.organization_id, 160) || null,
        allowedRoles: action === "updateOrganization" ? ["ORG_ADMIN"] : ORG_ROLES
      });
      if (!authorization.ok) return jsonError(authorization.error, authorization.status);
      if (action === "listAccounts") {
        const accountFilter = authorization.role === "BRANCH_ADMIN" ? {
          organization_id: authorization.organizationId,
          branch_id: authorization.account?.branch_id
        } : { organization_id: authorization.organizationId };
        if (authorization.role === "BRANCH_ADMIN" && !accountFilter.branch_id) {
          return jsonError("La membresia BRANCH_ADMIN no tiene una sucursal canonica asignada", 403);
        }
        const accounts = await base44.asServiceRole.entities.UserAccount.filter(
          accountFilter,
          "-created_date",
          500
        );
        return Response.json({ accounts: (accounts || []).map(sanitizeUserAccount) });
      }
      const [organization] = await base44.asServiceRole.entities.Organization.filter({
        id: authorization.organizationId
      }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404);
      if (action === "getOrganization") {
        return Response.json({ organization: sanitizeOrganization(organization) });
      }
      const updates = pick(body.changes, ORG_UPDATE_FIELDS);
      const updated = await base44.asServiceRole.entities.Organization.update(organization.id, updates);
      return Response.json({ organization: sanitizeOrganization(updated) });
    }
    if (action === "adminListAccounts" || action === "adminListBranches") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const organizationId = clean3(body.organization_id, 160);
      if (!organizationId) return jsonError("Organizacion requerida", 400, "ORGANIZATION_REQUIRED");
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404, "ORGANIZATION_NOT_FOUND");
      if (action === "adminListAccounts") {
        const accounts = await base44.asServiceRole.entities.UserAccount.filter({ organization_id: organizationId }, "-created_date", 500);
        return Response.json({ accounts: (accounts || []).map(sanitizeUserAccount) });
      }
      const branches = await base44.asServiceRole.entities.Branch.filter({ organization_id: organizationId }, "-created_date", 500);
      return Response.json({ branches: branches || [] });
    }
    if (action === "adminOverview") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const [organizations, accounts, auditLogs] = await Promise.all([
        base44.asServiceRole.entities.Organization.list("-created_date", 500),
        base44.asServiceRole.entities.UserAccount.list("-created_date", 2e3),
        base44.asServiceRole.entities.SuperAdminAudit.list("-recorded_at", 200)
      ]);
      const organizationEntitlements = await Promise.all((organizations || []).map(async (organization) => ({
        organization_id: organization.id,
        entitlement: await resolveEffectiveEntitlement(base44, organization)
      })));
      return Response.json({
        organizations: (organizations || []).map(sanitizeOrganization),
        entitlements: Object.fromEntries(organizationEntitlements.map((item) => [item.organization_id, item.entitlement])),
        accounts: (accounts || []).map(sanitizeUserAccount),
        auditLogs: (auditLogs || []).map(projectSuperAdminAudit)
      });
    }
    if (action === "adminSetEntitlement") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const organizationId = clean3(body.organization_id, 160);
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404, "ORGANIZATION_NOT_FOUND");
      if (inspectControlledPilotConfiguration(organization).enabled) {
        return jsonError("El superadmin no puede mutar una organizacion en piloto controlado", 409, "CONTROLLED_PILOT_ADMIN_MUTATION_DISABLED");
      }
      const packageId = normalizePackageId(body.package_id);
      if (!packageId) return jsonError("Paquete comercial invalido", 400, "COMMERCIAL_PACKAGE_INVALID");
      const billingStatus = ["trial", "active", "past_due", "suspended", "cancelled"].includes(body.billing_status) ? body.billing_status : "active";
      const billingInterval = ["monthly", "annual", "contract"].includes(body.billing_interval) ? body.billing_interval : packageId === "enterprise" ? "contract" : "monthly";
      const existing = await base44.asServiceRole.entities.EntitlementPolicy.filter({ organization_id: organizationId }, "-created_date", 20);
      const active = (existing || []).find((policy2) => !policy2.effective_until) || existing?.[0] || null;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const data = {
        organization_id: organizationId,
        package_id: packageId,
        billing_status: billingStatus,
        billing_interval: billingInterval,
        policy_version: "2026-09-c4",
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : active?.capabilities || [],
        limits: body.limits && typeof body.limits === "object" ? body.limits : active?.limits || {},
        overrides: body.overrides && typeof body.overrides === "object" ? body.overrides : active?.overrides || {},
        effective_from: active?.effective_from || now,
        source: ["contract", "migration", "admin", "pilot"].includes(body.source) ? body.source : "admin",
        notes: clean3(body.notes, 1e3) || active?.notes || "",
        license_status: ["pending", "active", "grace", "suspended", "revoked", "expired"].includes(body.license_status) ? body.license_status : active?.license_status || "pending",
        activated_at: active?.activated_at || null,
        activation_method: active?.activation_method || null,
        current_period_start: body.current_period_start || active?.current_period_start || null,
        current_period_end: body.current_period_end || active?.current_period_end || null,
        renewal_at: body.renewal_at || active?.renewal_at || null,
        grace_until: body.grace_until || active?.grace_until || null,
        cancel_at_period_end: body.cancel_at_period_end === true,
        billing_provider: clean3(body.billing_provider, 120) || active?.billing_provider || ""
      };
      const policy = active ? await base44.asServiceRole.entities.EntitlementPolicy.update(active.id, data) : await base44.asServiceRole.entities.EntitlementPolicy.create(data);
      await appendSuperAdminAudit(base44, user, {
        action: "update_org",
        organizationId: organization.id,
        organizationName: organization.name,
        correlationId: body.correlation_id,
        metadata: { operation: "ENTITLEMENT_POLICY_SET", package_id: packageId, billing_status: billingStatus, billing_interval: billingInterval }
      });
      return Response.json({ success: true, policy, entitlement: await resolveEffectiveEntitlement(base44, organization) });
    }
    if (action === "adminSetCommercialLifecycle") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const organizationId = clean3(body.organization_id, 160);
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404, "ORGANIZATION_NOT_FOUND");
      if (inspectControlledPilotConfiguration(organization).enabled) return jsonError("El superadmin no puede mutar una organizacion en piloto controlado", 409, "CONTROLLED_PILOT_ADMIN_MUTATION_DISABLED");
      const policies = await base44.asServiceRole.entities.EntitlementPolicy.filter({ organization_id: organizationId }, "-created_date", 20);
      const active = (policies || []).find((policy2) => !policy2.effective_until) || policies?.[0] || null;
      if (!active) return jsonError("Primero configure el paquete comercial", 409, "ENTITLEMENT_REQUIRED");
      const billingStatus = ["trial", "active", "past_due", "suspended", "cancelled"].includes(body.billing_status) ? body.billing_status : active.billing_status;
      const licenseStatus = ["pending", "active", "grace", "suspended", "revoked", "expired"].includes(body.license_status) ? body.license_status : active.license_status;
      const updates = {
        billing_status: billingStatus,
        license_status: licenseStatus,
        current_period_start: body.current_period_start || active.current_period_start || null,
        current_period_end: body.current_period_end || active.current_period_end || null,
        renewal_at: body.renewal_at || active.renewal_at || null,
        grace_until: body.grace_until || active.grace_until || null,
        cancel_at_period_end: body.cancel_at_period_end === true,
        policy_version: "2026-09-c4",
        last_billing_event_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const policy = await base44.asServiceRole.entities.EntitlementPolicy.update(active.id, updates);
      await appendSuperAdminAudit(base44, user, { action: "update_org", organizationId: organization.id, organizationName: organization.name, correlationId: body.correlation_id, metadata: { operation: "COMMERCIAL_LIFECYCLE_SET", billing_status: billingStatus, license_status: licenseStatus, cancel_at_period_end: updates.cancel_at_period_end } });
      return Response.json({ success: true, policy, entitlement: await resolveEffectiveEntitlement(base44, organization) });
    }
    if (action === "adminActivateLicense") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const organizationId = clean3(body.organization_id, 160);
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404, "ORGANIZATION_NOT_FOUND");
      if (inspectControlledPilotConfiguration(organization).enabled) return jsonError("El superadmin no puede mutar una organizacion en piloto controlado", 409, "CONTROLLED_PILOT_ADMIN_MUTATION_DISABLED");
      const policies = await base44.asServiceRole.entities.EntitlementPolicy.filter({ organization_id: organizationId }, "-created_date", 20);
      const active = (policies || []).find((policy2) => !policy2.effective_until) || policies?.[0] || null;
      if (!active) return jsonError("Primero configure el paquete comercial", 409, "ENTITLEMENT_REQUIRED");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const policy = await base44.asServiceRole.entities.EntitlementPolicy.update(active.id, {
        license_status: "active",
        activated_at: active.activated_at || now,
        activation_method: ["admin", "invite", "contract", "migration", "pilot"].includes(body.activation_method) ? body.activation_method : "admin",
        policy_version: "2026-09-c4"
      });
      await appendSuperAdminAudit(base44, user, { action: "update_org", organizationId: organization.id, organizationName: organization.name, correlationId: body.correlation_id, metadata: { operation: "LICENSE_ACTIVATED", package_id: active.package_id } });
      return Response.json({ success: true, policy, entitlement: await resolveEffectiveEntitlement(base44, organization) });
    }
    if (action === "adminUpdateOrganization") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const organizationId = clean3(body.organization_id, 160);
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
      if (!organization) return jsonError("Organizacion no encontrada", 404);
      if (inspectControlledPilotConfiguration(organization).enabled) {
        return jsonError("El superadmin no puede mutar una organizacion en piloto controlado", 409, "CONTROLLED_PILOT_ADMIN_MUTATION_DISABLED");
      }
      const updates = pick(body.changes, ADMIN_ORG_UPDATE_FIELDS);
      if (Object.keys(updates).length === 0) return jsonError("No hay cambios permitidos", 400);
      const updated = await base44.asServiceRole.entities.Organization.update(organization.id, updates);
      const auditAction = updates.status === "active" ? "activate_org" : updates.status === "suspended" ? "deactivate_org" : Object.hasOwn(updates, "plan") ? "change_plan" : "update_org";
      try {
        await appendSuperAdminAudit(base44, user, {
          action: auditAction,
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId: body.correlation_id,
          context: clean3(body.audit_context, 2e3),
          metadata: { changed_fields: Object.keys(updates) }
        });
      } catch (error) {
        const rollback = Object.fromEntries(Object.keys(updates).map((field) => [field, organization[field] ?? null]));
        await base44.asServiceRole.entities.Organization.update(organization.id, rollback);
        throw error;
      }
      return Response.json({ organization: sanitizeOrganization(updated) });
    }
    if (action === "adminCreateOrganization") {
      if (!isCanonicalSuperAdmin(user)) return jsonError("Superadmin requerido", 403, "SUPERADMIN_REQUIRED");
      const input = body.organization || {};
      const adminEmail = clean3(body.admin_email, 254).toLowerCase();
      const name = clean3(input.name, 240);
      const country = clean3(input.country, 120);
      const currency = clean3(input.currency, 16).toUpperCase();
      const plan = ["basic", "pro", "premium"].includes(input.plan) ? input.plan : "basic";
      if (!name || !country || !currency || !adminEmail) {
        return jsonError("Organizacion y email administrador son requeridos", 400);
      }
      const created = [];
      try {
        const correlationId = clean3(body.correlation_id, 240) || crypto.randomUUID();
        const organization = await base44.asServiceRole.entities.Organization.create(canonicalOrganizationData({
          ...pick(input, ADMIN_ORG_UPDATE_FIELDS),
          name,
          country,
          currency,
          plan
        }, correlationId));
        created.push({ entity: "Organization", id: organization.id });
        const branch = await base44.asServiceRole.entities.Branch.create(canonicalPrimaryBranchData(organization.id));
        created.push({ entity: "Branch", id: branch.id });
        const account = await base44.asServiceRole.entities.UserAccount.create(canonicalOwnerMembershipData({
          organizationId: organization.id,
          email: adminEmail,
          status: "invited"
        }));
        created.push({ entity: "UserAccount", id: account.id });
        await seedBaselineCategories(base44, organization.id, created);
        try {
          await base44.users.inviteUser(adminEmail, "user");
        } catch (error) {
          console.warn("[identityGateway] invite warning", error?.message);
        }
        await appendSuperAdminAudit(base44, user, {
          action: "create_org",
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId,
          metadata: { admin_email: adminEmail }
        });
        const finalized = await finalizeProvisioning(base44, {
          organization,
          branch,
          account,
          actor: user,
          principalClass: "PLATFORM_ADMIN",
          correlationId
        });
        return Response.json({
          organization: sanitizeOrganization(finalized.organization),
          account: sanitizeUserAccount(account),
          branch,
          readiness: finalized.readiness
        }, { status: 201 });
      } catch (error) {
        await compensate(base44, created);
        throw error;
      }
    }
    return jsonError(`Accion de identidad desconocida: ${action}`, 400);
  } catch (error) {
    const diagnosticCode = error?.code || `IDENTITY_GATEWAY_${diagnosticStage}_FAILED`;
    console.error("[identityGateway]", {
      stage: diagnosticStage,
      code: diagnosticCode,
      message: error?.message || String(error)
    });
    return jsonError("No se pudo completar la operacion de identidad", 500, diagnosticCode);
  }
});
