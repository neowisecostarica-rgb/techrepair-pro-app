// base44/functions/processOTEvent/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// base44/functions/_shared/controlledPilotAuthority.ts
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

// base44/functions/_shared/roleCapabilities.ts
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
  BRANCH_ADMIN: [
    "BRANCH_ADMINISTRATION",
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
  ],
  TECHNICIAN: [
    "CUSTOMER_READ_OPERATIONAL",
    "TECHNICAL_WORK",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS"
  ],
  SALES: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "TECHNICAL_ASSIGNMENT",
    "QUOTE_OPERATIONS",
    "SALE_OPERATIONS",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "DELIVERY_OPERATIONS",
    "CRM_OPERATIONS",
    "AGENDA_OPERATIONS"
  ],
  INVENTORY: [
    "CUSTOMER_READ_OPERATIONAL",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS",
    "INVENTORY_ADMINISTRATION"
  ],
  CUSTOMER_SERVICE: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "COMMERCIAL_READ",
    "DELIVERY_OPERATIONS",
    "AGENDA_OPERATIONS"
  ]
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

// base44/functions/_shared/userAuthorization.ts
function isCanonicalActiveUserAccount(account) {
  return account?.status === "active";
}
function getUserDataField(user, field) {
  return user?.data?.[field] ?? user?.[field] ?? null;
}
function isCanonicalSuperAdmin(user) {
  return user?.role === "admin";
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
async function loadCanonicalMemberships(base44, user) {
  const [byUserId, byEmail] = await Promise.all([
    base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, "-created_date", 100),
    user.email ? base44.asServiceRole.entities.UserAccount.filter({ user_email: user.email }, "-created_date", 100) : Promise.resolve([])
  ]);
  const unique = /* @__PURE__ */ new Map();
  for (const account of [...byUserId || [], ...byEmail || []]) {
    if (account?.id) unique.set(account.id, account);
  }
  return [...unique.values()];
}
async function resolveIdentitySnapshot(base44, user) {
  if (!user?.id) return { ok: false, status: 401, error: "No autenticado" };
  const isSuperAdmin = isCanonicalSuperAdmin(user);
  const memberships = isSuperAdmin ? [] : await loadCanonicalMemberships(base44, user);
  const activeMemberships = memberships.filter(
    (account) => account.user_id === user.id && account.organization_id && isCanonicalActiveUserAccount(account)
  );
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

// base44/functions/_shared/lifecycleSecurity.ts
var EVENT_REQUIRED_STATE = Object.freeze({
  FINALIZADA: "FINALIZADA",
  ENTREGADA: "ENTREGADA",
  CANCELADA: "CANCELADA"
});
function requiredWorkOrderStateForEvent(eventType) {
  return EVENT_REQUIRED_STATE[eventType] || null;
}
function eventMatchesCurrentWorkOrderState(eventType, workOrder) {
  const requiredState = requiredWorkOrderStateForEvent(eventType);
  return !requiredState || workOrder?.estado === requiredState;
}

// base44/functions/_shared/operationalAuthorization.ts
var ALL_OPERATIONAL_ROLES = [
  "ORG_ADMIN",
  "BRANCH_ADMIN",
  "TECHNICIAN",
  "SALES",
  "INVENTORY",
  "CUSTOMER_SERVICE"
];
var ADMIN_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN"];
var COMMERCIAL_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"];
var CUSTOMER_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES", "CUSTOMER_SERVICE"];
var TECHNICAL_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"];
var INVENTORY_READ_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES", "INVENTORY"];
var OPERATIONAL_ENTITY_POLICIES = Object.freeze({
  ActividadTecnica: { read: ALL_OPERATIONAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  BloqueoTecnico: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ADMIN_ROLES, scope: "work_order" },
  Branch: { read: ALL_OPERATIONAL_ROLES, create: [], update: [], delete: [], scope: "branch" },
  CategoriaInventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "organization" },
  Cita: { read: ALL_OPERATIONAL_ROLES, create: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES"], update: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES"], delete: ADMIN_ROLES, scope: "branch" },
  Cliente: { read: CUSTOMER_ROLES, create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "customer" },
  ComprobanteVentaLog: { read: COMMERCIAL_ROLES, create: COMMERCIAL_ROLES, update: [], delete: [], scope: "sale" },
  Cotizacion: { read: [...COMMERCIAL_ROLES, "TECHNICIAN", "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: COMMERCIAL_ROLES, delete: ["ORG_ADMIN"], scope: "quote" },
  DiagnosticMasterRecord: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: [], update: [], delete: [], scope: "work_order" },
  Diagnostico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoDocumento: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "diagnostic_document" },
  DiagnosticoEvidencia: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoResultado: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoTecnico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  EntregaLog: { read: COMMERCIAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  Equipo: { read: [...CUSTOMER_ROLES, "TECHNICIAN"], create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "equipment" },
  Expense: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ADMIN_ROLES, scope: "branch" },
  Garantia: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: ADMIN_ROLES, delete: [], scope: "warranty" },
  Inventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "branch" },
  InventarioHistorial: { read: ["ORG_ADMIN", "BRANCH_ADMIN", "INVENTORY"], create: [], update: [], delete: [], scope: "inventory_history" },
  InventarioReserva: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  NoConformidad: { read: TECHNICAL_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["ORG_ADMIN"], scope: "work_order_optional" },
  NotaInterna: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ADMIN_ROLES, scope: "work_order" },
  Notificacion: { read: ALL_OPERATIONAL_ROLES, create: ALL_OPERATIONAL_ROLES, update: ALL_OPERATIONAL_ROLES, delete: ["ORG_ADMIN"], scope: "notification" },
  OTEvent: { read: ALL_OPERATIONAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  OrdenTrabajo: { read: ALL_OPERATIONAL_ROLES, create: [], update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  PreDiagnostico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: [...TECHNICAL_ROLES, "SALES"], update: [...TECHNICAL_ROLES, "SALES"], delete: ["ORG_ADMIN"], scope: "work_order" },
  PruebaTecnica: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  PurchaseInvoice: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  Reciclaje: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  RegistroTiempo: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  Servicio: { read: INVENTORY_READ_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  SolicitudTecnica: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order_optional" },
  Supplier: { read: ADMIN_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  SupplierPayment: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "purchase_invoice" },
  TerminosYCondiciones: { read: ALL_OPERATIONAL_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  Venta: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: [], delete: [], scope: "branch" },
  VentaItem: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: [], delete: [], scope: "sale" },
  WorkflowGate: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: "workflow_gate" }
});
var PROTECTED_OPERATIONAL_ENTITIES = Object.freeze(Object.keys(OPERATIONAL_ENTITY_POLICIES));
function isOrganizationWideRole(role) {
  return role === "ORG_ADMIN";
}
function getCanonicalBranchScope(authorization) {
  if (!authorization?.ok) {
    return { ok: false, status: authorization?.status || 403, error: authorization?.error || "No autorizado" };
  }
  if (authorization.pilotMode === true) {
    if (!authorization.pilotBranchId) {
      return { ok: false, status: 503, code: "CONTROLLED_PILOT_CONFIGURATION_INVALID", error: "El piloto no tiene una sucursal canonica valida" };
    }
    return { ok: true, organizationWide: false, branchId: authorization.pilotBranchId };
  }
  if (isOrganizationWideRole(authorization.role)) {
    return { ok: true, organizationWide: true, branchId: null };
  }
  const branchId = authorization.account?.branch_id || null;
  if (!branchId) {
    return {
      ok: false,
      status: 403,
      error: "La membresia operacional no tiene una sucursal canonica asignada",
      code: "OPERATIONAL_BRANCH_REQUIRED"
    };
  }
  return { ok: true, organizationWide: false, branchId };
}
function authorizeRecordBranch(authorization, recordBranchId) {
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return branchScope;
  if (branchScope.organizationWide) return { ok: true, branchScope };
  if (!recordBranchId || recordBranchId !== branchScope.branchId) {
    return {
      ok: false,
      status: 403,
      code: "OPERATIONAL_CROSS_BRANCH_DENIED",
      error: "El recurso no pertenece a la sucursal autorizada"
    };
  }
  return { ok: true, branchScope };
}
var WORK_ORDER_EDITABLE_FIELDS = Object.freeze([
  "motivo_ingreso",
  "observaciones_ingreso",
  "tipo_ingreso",
  "prioridad"
]);

// base44/functions/processOTEvent/entry.ts
function resolveEmailAddress(ot, cliente) {
  return ot?.cliente_email || ot?.email_cliente || ot?.email || cliente?.email || cliente?.correo || null;
}
async function getClienteForOT(base44, ot) {
  if (!ot?.cliente_id) return null;
  try {
    const clientes = await base44.asServiceRole.entities.Cliente.filter({ id: ot.cliente_id }, 1);
    return Array.isArray(clientes) && clientes.length > 0 ? clientes[0] : null;
  } catch (err) {
    console.warn(`[processOTEvent] cliente_lookup_failed: ${err.message}`);
    return null;
  }
}
async function safeTrack(base44, eventName, properties = {}) {
  try {
    if (base44.analytics?.track) {
      await base44.analytics.track({ eventName, properties });
    }
  } catch (err) {
    console.warn(`[processOTEvent] analytics_track_failed: ${err.message}`);
  }
}
var EMAIL_TEMPLATES = {
  CREATED: {
    flag: "email_created_sent",
    subject: (ot) => `Orden de trabajo creada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || "cliente"},

Hemos recibido su equipo y creamos la orden de trabajo ${ot.codigo_ot || ot.id}.

Le estaremos notificando cualquier avance importante.

Gracias por confiar en nosotros.`.trim()
  },
  FINALIZADA: {
    flag: "email_finalizada_sent",
    subject: (ot) => `Orden de trabajo finalizada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || "cliente"},

Su orden de trabajo ${ot.codigo_ot || ot.id} ha sido finalizada.

Ya puede coordinar la entrega o retiro del equipo.

Gracias por confiar en nosotros.`.trim()
  },
  ENTREGADA: {
    flag: "email_entregada_sent",
    subject: (ot) => `Orden de trabajo entregada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || "cliente"},

Confirmamos que la orden de trabajo ${ot.codigo_ot || ot.id} fue entregada.

Gracias por confiar en nosotros.`.trim()
  },
  CANCELADA: {
    flag: "email_cancelada_sent",
    subject: (ot) => `Orden de trabajo cancelada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || "cliente"},

Le informamos que la orden de trabajo ${ot.codigo_ot || ot.id} ha sido cancelada.

Si tiene alguna consulta al respecto, no dude en comunicarse con nosotros.

Gracias por confiar en nosotros.`.trim()
  }
};
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    let callerUser = null;
    try {
      callerUser = await base44.auth.me();
    } catch {
      callerUser = null;
    }
    if (!callerUser) {
      return Response.json({
        error: "La automatizacion no tiene attestation verificable en el runtime actual.",
        code: "AUTOMATION_TRUST_ATTESTATION_UNAVAILABLE",
        side_effects_executed: false
      }, { status: 503 });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Body inv\xE1lido o vac\xEDo" }, { status: 400 });
    }
    const automationEventId = body?.event?.entity_id;
    const directEventId = body?.ot_event_id;
    const eventId = automationEventId || directEventId;
    if (!eventId) {
      console.error("[processOTEvent] Payload inv\xE1lido: falta event.entity_id u ot_event_id");
      return Response.json({
        error: "Payload inv\xE1lido: falta event.entity_id u ot_event_id",
        received_keys: Object.keys(body || {})
      }, { status: 400 });
    }
    let evento;
    try {
      const eventos = await base44.asServiceRole.entities.OTEvent.filter({ id: eventId }, 1);
      if (!eventos || eventos.length === 0) {
        console.error(`[processOTEvent] OTEvent no encontrado \u2014 event_id: ${eventId}`);
        return Response.json({
          error: `OTEvent no encontrado: ${eventId}`,
          event_id: eventId
        }, { status: 404 });
      }
      evento = eventos[0];
    } catch (readError) {
      console.error(`[processOTEvent] Error al leer OTEvent: ${readError.message}`);
      return Response.json({ error: `Error al leer OTEvent: ${readError.message}` }, { status: 500 });
    }
    const { organization_id, orden_trabajo_id, tipo, processed } = evento;
    if (callerUser) {
      const authorization = await resolveAuthorizedContext(base44, callerUser, {
        organizationHint: organization_id,
        allowedRoles: ["ORG_ADMIN", "BRANCH_ADMIN"]
      });
      if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
      if (authorization.pilotMode) {
        return Response.json({ error: "El consumo automatizado de eventos esta deshabilitado durante el piloto controlado", code: "CONTROLLED_PILOT_AUTOMATION_MUTATION_DISABLED" }, { status: 409 });
      }
      const workOrders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
        id: orden_trabajo_id,
        organization_id
      }, "-created_date", 1);
      const workOrder = workOrders?.[0];
      if (!workOrder) return Response.json({ error: "OT no encontrada para el evento" }, { status: 404 });
      const branchAuthorization = authorizeRecordBranch(authorization, workOrder.branch_id);
      if (!branchAuthorization.ok) {
        return Response.json(
          { error: branchAuthorization.error, code: branchAuthorization.code },
          { status: branchAuthorization.status }
        );
      }
    }
    if (!organization_id) {
      console.warn(`[processOTEvent] Evento sin organization_id \u2014 event_id: ${eventId}, tipo: ${tipo}, OT: ${orden_trabajo_id}`);
      await safeTrack(base44, "ot_event_skipped", { reason: "missing_organization_id", event_id: eventId, tipo });
      return Response.json({
        success: false,
        skipped: true,
        reason: "missing_organization_id",
        event_id: eventId,
        tipo,
        orden_trabajo_id: orden_trabajo_id || null,
        note: "Evento pre-0B.2A sin organization_id. No se marca processed para auditor\xEDa."
      }, { status: 200 });
    }
    await safeTrack(base44, "ot_event_received", { event_id: eventId, tipo, org: organization_id, ot_id: orden_trabajo_id || null });
    if (processed === true) {
      await safeTrack(base44, "ot_event_skipped", { reason: "already_processed", event_id: eventId, tipo, org: organization_id });
      return Response.json({
        success: true,
        skipped: true,
        reason: "already_processed",
        event_id: eventId,
        tipo,
        organization_id,
        orden_trabajo_id: orden_trabajo_id || null
      });
    }
    const requiredState = requiredWorkOrderStateForEvent(tipo);
    if (requiredState) {
      const currentOrders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
        id: orden_trabajo_id,
        organization_id
      }, 1);
      const currentOrder = currentOrders?.[0] || null;
      if (!currentOrder || !eventMatchesCurrentWorkOrderState(tipo, currentOrder)) {
        await safeTrack(base44, "ot_event_skipped", {
          reason: "work_order_state_mismatch",
          event_id: eventId,
          tipo,
          required_state: requiredState,
          current_state: currentOrder?.estado || null
        });
        return Response.json({
          success: false,
          skipped: true,
          reason: "work_order_state_mismatch",
          required_state: requiredState,
          current_state: currentOrder?.estado || null,
          event_id: eventId
        }, { status: 409 });
      }
    }
    let tipoReconocido = true;
    switch (tipo) {
      case "CREATED": {
        const tmpl = EMAIL_TEMPLATES.CREATED;
        let ot = null;
        try {
          const ots = await base44.asServiceRole.entities.OrdenTrabajo.filter({
            id: orden_trabajo_id,
            organization_id
          }, 1);
          ot = Array.isArray(ots) && ots.length > 0 ? ots[0] : null;
        } catch (otErr) {
          console.warn(`[processOTEvent] [CREATED] Error cargando OT ${orden_trabajo_id}: ${otErr.message}`);
        }
        if (!ot) {
          console.warn(`[processOTEvent] [CREATED] OT no encontrada: ${orden_trabajo_id} \u2014 skipping email`);
          break;
        }
        if (ot.organization_id !== organization_id) {
          console.warn(`[processOTEvent] [CREATED] Mismatch org \u2014 OT: ${ot.organization_id}, event: ${organization_id} \u2014 skipping`);
          break;
        }
        if (ot[tmpl.flag] === true) {
          break;
        }
        const cliente = await getClienteForOT(base44, ot);
        const toEmail = resolveEmailAddress(ot, cliente);
        if (!toEmail) {
          break;
        }
        let emailSent = false;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: toEmail,
            subject: tmpl.subject(ot),
            body: tmpl.body(ot, cliente)
          });
          emailSent = true;
          console.log(`[processOTEvent] [CREATED] Email enviado \u2014 OT: ${ot.id}, to: ${toEmail}`);
        } catch (emailErr) {
          console.error(`[processOTEvent] [CREATED] SendEmail fall\xF3 \u2014 OT: ${ot.id}: ${emailErr.message}`);
          await safeTrack(base44, "ot_email_failed", { tipo: "CREATED", ot_id: ot.id, error: emailErr.message, org: organization_id });
          break;
        }
        if (emailSent) {
          try {
            await base44.asServiceRole.entities.OrdenTrabajo.update(ot.id, { [tmpl.flag]: true });
            console.log(`[processOTEvent] [CREATED] ${tmpl.flag}=true actualizado \u2014 OT: ${ot.id}`);
          } catch (flagErr) {
            console.error(`[processOTEvent] [CREATED] Error actualizando ${tmpl.flag} \u2014 OT: ${ot.id}: ${flagErr.message}`);
          }
          await safeTrack(base44, "ot_email_sent", { tipo: "CREATED", ot_id: ot.id, to: toEmail, org: organization_id });
        }
        break;
      }
      case "FINALIZADA": {
        const tmplF = EMAIL_TEMPLATES.FINALIZADA;
        let otF = null;
        try {
          const otsF = await base44.asServiceRole.entities.OrdenTrabajo.filter({
            id: orden_trabajo_id,
            organization_id,
            estado: "FINALIZADA"
          }, 1);
          otF = Array.isArray(otsF) && otsF.length > 0 ? otsF[0] : null;
        } catch (otErrF) {
          console.warn(`[processOTEvent] [FINALIZADA] Error cargando OT ${orden_trabajo_id}: ${otErrF.message}`);
        }
        if (!otF) {
          console.warn(`[processOTEvent] [FINALIZADA] OT no encontrada: ${orden_trabajo_id} \u2014 skipping email`);
          break;
        }
        if (otF.organization_id !== organization_id) {
          console.warn(`[processOTEvent] [FINALIZADA] Mismatch org \u2014 OT: ${otF.organization_id}, event: ${organization_id} \u2014 skipping`);
          break;
        }
        if (otF[tmplF.flag] === true) {
          break;
        }
        const clienteF = await getClienteForOT(base44, otF);
        const toEmailF = resolveEmailAddress(otF, clienteF);
        if (!toEmailF) {
          break;
        }
        let emailSentF = false;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: toEmailF,
            subject: tmplF.subject(otF),
            body: tmplF.body(otF, clienteF)
          });
          emailSentF = true;
          console.log(`[processOTEvent] [FINALIZADA] Email enviado \u2014 OT: ${otF.id}, to: ${toEmailF}`);
        } catch (emailErrF) {
          console.error(`[processOTEvent] [FINALIZADA] SendEmail fall\xF3 \u2014 OT: ${otF.id}: ${emailErrF.message}`);
          await safeTrack(base44, "ot_email_failed", { tipo: "FINALIZADA", ot_id: otF.id, error: emailErrF.message, org: organization_id });
          break;
        }
        if (emailSentF) {
          try {
            await base44.asServiceRole.entities.OrdenTrabajo.update(otF.id, { [tmplF.flag]: true });
            console.log(`[processOTEvent] [FINALIZADA] ${tmplF.flag}=true actualizado \u2014 OT: ${otF.id}`);
          } catch (flagErrF) {
            console.error(`[processOTEvent] [FINALIZADA] Error actualizando ${tmplF.flag} \u2014 OT: ${otF.id}: ${flagErrF.message}`);
          }
          await safeTrack(base44, "ot_email_sent", { tipo: "FINALIZADA", ot_id: otF.id, to: toEmailF, org: organization_id });
        }
        break;
      }
      case "ENTREGADA": {
        const tmplE = EMAIL_TEMPLATES.ENTREGADA;
        let otE = null;
        try {
          const otsE = await base44.asServiceRole.entities.OrdenTrabajo.filter({
            id: orden_trabajo_id,
            organization_id,
            estado: "ENTREGADA"
          }, 1);
          otE = Array.isArray(otsE) && otsE.length > 0 ? otsE[0] : null;
        } catch (otErrE) {
          console.warn(`[processOTEvent] [ENTREGADA] Error cargando OT ${orden_trabajo_id}: ${otErrE.message}`);
        }
        if (!otE) {
          console.warn(`[processOTEvent] [ENTREGADA] OT no encontrada: ${orden_trabajo_id} \u2014 skipping email`);
          break;
        }
        if (otE.organization_id !== organization_id) {
          console.warn(`[processOTEvent] [ENTREGADA] Mismatch org \u2014 OT: ${otE.organization_id}, event: ${organization_id} \u2014 skipping`);
          break;
        }
        if (otE[tmplE.flag] === true) {
          break;
        }
        const clienteE = await getClienteForOT(base44, otE);
        const toEmailE = resolveEmailAddress(otE, clienteE);
        if (!toEmailE) {
          break;
        }
        let emailSentE = false;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: toEmailE,
            subject: tmplE.subject(otE),
            body: tmplE.body(otE, clienteE)
          });
          emailSentE = true;
          console.log(`[processOTEvent] [ENTREGADA] Email enviado \u2014 OT: ${otE.id}, to: ${toEmailE}`);
        } catch (emailErrE) {
          console.error(`[processOTEvent] [ENTREGADA] SendEmail fall\xF3 \u2014 OT: ${otE.id}: ${emailErrE.message}`);
          await safeTrack(base44, "ot_email_failed", { tipo: "ENTREGADA", ot_id: otE.id, error: emailErrE.message, org: organization_id });
          break;
        }
        if (emailSentE) {
          try {
            await base44.asServiceRole.entities.OrdenTrabajo.update(otE.id, { [tmplE.flag]: true });
            console.log(`[processOTEvent] [ENTREGADA] ${tmplE.flag}=true actualizado \u2014 OT: ${otE.id}`);
          } catch (flagErrE) {
            console.error(`[processOTEvent] [ENTREGADA] Error actualizando ${tmplE.flag} \u2014 OT: ${otE.id}: ${flagErrE.message}`);
          }
          await safeTrack(base44, "ot_email_sent", { tipo: "ENTREGADA", ot_id: otE.id, to: toEmailE, org: organization_id });
        }
        break;
      }
      case "CANCELADA": {
        const tmplC = EMAIL_TEMPLATES.CANCELADA;
        let otC = null;
        try {
          const otsC = await base44.asServiceRole.entities.OrdenTrabajo.filter({
            id: orden_trabajo_id,
            organization_id,
            estado: "CANCELADA"
          }, 1);
          otC = Array.isArray(otsC) && otsC.length > 0 ? otsC[0] : null;
        } catch (otErrC) {
          console.warn(`[processOTEvent] [CANCELADA] Error cargando OT ${orden_trabajo_id}: ${otErrC.message}`);
        }
        if (!otC) {
          console.warn(`[processOTEvent] [CANCELADA] OT no encontrada: ${orden_trabajo_id} \u2014 skipping email`);
          break;
        }
        if (otC.organization_id !== organization_id) {
          console.warn(`[processOTEvent] [CANCELADA] Mismatch org \u2014 OT: ${otC.organization_id}, event: ${organization_id} \u2014 skipping`);
          break;
        }
        if (otC[tmplC.flag] === true) {
          break;
        }
        const clienteC = await getClienteForOT(base44, otC);
        const toEmailC = resolveEmailAddress(otC, clienteC);
        if (!toEmailC) {
          break;
        }
        let emailSentC = false;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: toEmailC,
            subject: tmplC.subject(otC),
            body: tmplC.body(otC, clienteC)
          });
          emailSentC = true;
          console.log(`[processOTEvent] [CANCELADA] Email enviado \u2014 OT: ${otC.id}, to: ${toEmailC}`);
        } catch (emailErrC) {
          console.error(`[processOTEvent] [CANCELADA] SendEmail fall\xF3 \u2014 OT: ${otC.id}: ${emailErrC.message}`);
          await safeTrack(base44, "ot_email_failed", { tipo: "CANCELADA", ot_id: otC.id, error: emailErrC.message, org: organization_id });
          break;
        }
        if (emailSentC) {
          try {
            await base44.asServiceRole.entities.OrdenTrabajo.update(otC.id, { [tmplC.flag]: true });
          } catch (flagErrC) {
            console.error(`[processOTEvent] [CANCELADA] Error actualizando ${tmplC.flag} \u2014 OT: ${otC.id}: ${flagErrC.message}`);
          }
          await safeTrack(base44, "ot_email_sent", { tipo: "CANCELADA", ot_id: otC.id, to: toEmailC, org: organization_id });
        }
        break;
      }
      case "SALE_COMPLETED":
        console.log(`[processOTEvent] [SALE_COMPLETED] OT: ${orden_trabajo_id} \u2014 hook point 0B.2E`);
        break;
      case "TRANSITION_ASIGNADA":
      case "TRANSITION_EN_REVISION":
      case "TRANSITION_DIAGNOSTICADA":
      case "TRANSITION_COTIZADA":
      case "TRANSITION_APROBADA":
      case "TRANSITION_EN_REPARACION":
      case "TRANSITION_PRUEBAS":
        console.log(`[processOTEvent] [${tipo}] OT: ${orden_trabajo_id} \u2014 hook point 0B.2D (SLA)`);
        break;
      case "ATTENTION_STATUS_CHANGED":
        break;
      default:
        tipoReconocido = false;
        console.warn(`[processOTEvent] Tipo de evento no reconocido: "${tipo}" \u2014 event_id: ${eventId}`);
        await safeTrack(base44, "ot_event_skipped", { reason: "unrecognized_type", tipo, event_id: eventId, org: organization_id });
    }
    try {
      const marked = await base44.asServiceRole.entities.OTEvent.updateMany({
        id: eventId,
        organization_id,
        $or: [
          { processed: false },
          { processed: null },
          { processed: { $exists: false } }
        ]
      }, { $set: { processed: true } });
      if (marked?.updated !== 1) {
        const [currentEvent] = await base44.asServiceRole.entities.OTEvent.filter({
          id: eventId,
          organization_id
        }, 1);
        if (currentEvent?.processed !== true) {
          throw new Error("El evento cambio concurrentemente y no pudo confirmarse como procesado");
        }
      }
    } catch (updateError) {
      console.error(`[processOTEvent] Error al marcar processed=true \u2014 event_id: ${eventId}: ${updateError.message}`);
      return Response.json({
        success: false,
        error: `No se pudo marcar processed=true: ${updateError.message}`,
        event_id: eventId,
        tipo,
        organization_id
      }, { status: 500 });
    }
    await safeTrack(base44, "ot_event_processed", {
      event_id: eventId,
      tipo,
      tipo_reconocido: tipoReconocido,
      org: organization_id,
      ot_id: orden_trabajo_id || null
    });
    const resumen = {
      success: true,
      skipped: false,
      event_id: eventId,
      tipo,
      tipo_reconocido: tipoReconocido,
      organization_id,
      orden_trabajo_id: orden_trabajo_id || null,
      processed_at: now,
      caller: callerUser?.email || "automation"
    };
    return Response.json(resumen);
  } catch (error) {
    console.error(`[processOTEvent] Error no controlado: ${error.message}`);
    await safeTrack(base44, "ot_event_failed", { error: error.message });
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
